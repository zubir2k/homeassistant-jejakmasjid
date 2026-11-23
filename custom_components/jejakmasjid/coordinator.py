"""Coordinator: nearby masjid and surau for every person with GPS and the Home zone."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_SCAN_INTERVAL
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from jejakmasjid import API_TYPE_MAP, JejakMasjidError, async_fetch_nearby, haversine_km, rank
from .const import (
    CACHE_STORAGE_VERSION,
    CACHE_TTL_HOURS,
    CONF_RADIUS,
    COORD_DECIMALS,
    DEFAULT_RADIUS,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    FAILURE_BACKOFF_MINUTES,
    FETCH_RADIUS_KM,
    MAX_CACHED_SEARCHES,
    MIN_REFETCH_KM,
    NEARBY_LIMIT,
    PLACE_TYPES,
)

_LOGGER = logging.getLogger(__name__)

HOME = "zone.home"

type JejakMasjidConfigEntry = ConfigEntry["JejakMasjidCoordinator"]


@dataclass
class _Search:
    """One API search: its (rounded) centre, when it ran and what it found."""

    lat: float
    lon: float
    fetched: datetime
    places: list[dict[str, Any]]

    def as_dict(self) -> dict[str, Any]:
        return {"lat": self.lat, "lon": self.lon, "fetched": self.fetched.isoformat(), "places": self.places}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> _Search:
        return cls(float(data["lat"]), float(data["lon"]), dt_util.parse_datetime(data["fetched"]), data["places"])


class JejakMasjidCoordinator(DataUpdateCoordinator[dict[str, dict[str, Any]]]):
    """Reads every person's GPS (and zone.home) and finds the masjid and surau around them.

    API calls are kept to a minimum:
    * each search asks for FETCH_RADIUS_KM (the API maximum) and is ranked locally, so one
      search serves a location until it has moved FETCH_RADIUS_KM - radius away;
    * searches are shared, so a person at home reuses Home's search (and family members
      together share one);
    * searches stay valid for CACHE_TTL_HOURS and survive restarts (.storage);
    * a failed call backs off for FAILURE_BACKOFF_MINUTES.
    Distances are always recomputed from the live position.
    """

    account: Any = None

    config_entry: JejakMasjidConfigEntry

    def __init__(self, hass: HomeAssistant, entry: JejakMasjidConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name="Jejak Masjid",
            update_interval=timedelta(
                minutes=entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
            ),
        )
        self.radius: int = int(entry.options.get(CONF_RADIUS, DEFAULT_RADIUS))
        self.reach_km: float = max(MIN_REFETCH_KM, FETCH_RADIUS_KM - self.radius)
        self._pool: list[_Search] = []
        self._backoff_until: datetime | None = None
        self._store: Store[dict[str, Any]] = Store(hass, CACHE_STORAGE_VERSION, f"{DOMAIN}.cache")
        self.api_calls = 0  # for diagnostics

    async def async_load_cache(self) -> None:
        """Restore searches saved before the last restart."""
        try:
            data = await self._store.async_load()
            self._pool = [_Search.from_dict(item) for item in (data or {}).get("searches", [])]
        except (KeyError, TypeError, ValueError):
            _LOGGER.debug("Ignoring unreadable search cache")
            self._pool = []

    def _save_cache(self) -> None:
        self._store.async_delay_save(lambda: {"searches": [s.as_dict() for s in self._pool]}, 10)

    def tracked_locations(self) -> dict[str, tuple[str, float, float]]:
        """{entity_id: (friendly name, lat, lon)} for every person with GPS, and Home."""
        out: dict[str, tuple[str, float, float]] = {}
        for entity_id in self.hass.states.async_entity_ids("person"):
            state = self.hass.states.get(entity_id)
            lat = state.attributes.get("latitude") if state else None
            lon = state.attributes.get("longitude") if state else None
            if lat is None or lon is None:
                _LOGGER.debug("Skipping %s as it lacks GPS coordinates", entity_id)
                continue
            out[entity_id] = (state.attributes.get("friendly_name", entity_id), float(lat), float(lon))
        home = self.hass.states.get(HOME)
        if home is not None and home.attributes.get("latitude") is not None:
            out[HOME] = (
                home.attributes.get("friendly_name", "Home"),
                float(home.attributes["latitude"]),
                float(home.attributes["longitude"]),
            )
        # Home first, so people at home reuse its search
        return dict(sorted(out.items(), key=lambda kv: kv[0] != HOME))

    def _covering(self, lat: float, lon: float, now: datetime, fresh: bool = True) -> _Search | None:
        """Closest cached search that still covers this spot."""
        best: tuple[float, _Search] | None = None
        limit = self.reach_km if fresh else FETCH_RADIUS_KM
        for search in self._pool:
            if fresh and now - search.fetched > timedelta(hours=CACHE_TTL_HOURS):
                continue
            dist = haversine_km(lat, lon, search.lat, search.lon)
            if dist <= limit and (best is None or dist < best[0]):
                best = (dist, search)
        return best[1] if best else None

    async def _async_update_data(self) -> dict[str, dict[str, Any]]:
        session = async_get_clientsession(self.hass)
        now = dt_util.utcnow()
        data: dict[str, dict[str, Any]] = {}
        errors: list[str] = []
        changed = False

        for key, (name, lat, lon) in self.tracked_locations().items():
            search = self._covering(lat, lon, now)
            if search is None and (self._backoff_until is None or now >= self._backoff_until):
                clat, clon = round(lat, COORD_DECIMALS), round(lon, COORD_DECIMALS)
                try:
                    places = await async_fetch_nearby(
                        session, clat, clon, FETCH_RADIUS_KM, api_type=API_TYPE_MAP
                    )
                except JejakMasjidError as err:
                    errors.append(str(err))
                    self._backoff_until = now + timedelta(minutes=FAILURE_BACKOFF_MINUTES)
                    _LOGGER.debug("Jejak Masjid call failed for %s, backing off: %s", key, err)
                else:
                    self.api_calls += 1
                    self._backoff_until = None
                    search = _Search(clat, clon, now, places)
                    self._pool.append(search)
                    changed = True
            if search is None:
                # Offline or backing off: an expired search nearby is better than nothing
                search = self._covering(lat, lon, now, fresh=False)
            if search is None:
                continue
            ranked = [p for p in rank(search.places, lat, lon) if p["distance_km"] <= self.radius]
            data[key] = self._summarise(name, lat, lon, ranked, search.fetched)

        # Drop expired searches and keep the pool small (newest first)
        kept = sorted(
            (s for s in self._pool if now - s.fetched <= timedelta(hours=CACHE_TTL_HOURS)),
            key=lambda s: s.fetched,
            reverse=True,
        )[:MAX_CACHED_SEARCHES]
        if changed or len(kept) != len(self._pool):
            self._pool = kept
            self._save_cache()

        if errors and not data:
            raise UpdateFailed(errors[0])
        return data

    def _summarise(
        self, name: str, lat: float, lon: float, ranked: list[dict[str, Any]], fetched: datetime
    ) -> dict[str, Any]:
        def nearest(kind: str | None) -> dict[str, Any] | None:
            return next((p for p in ranked if kind is None or p["type"] == kind), None)

        counts = {kind: 0 for kind in PLACE_TYPES}
        for place in ranked:
            counts[place["type"]] += 1
        return {
            "name": name,
            "latitude": lat,
            "longitude": lon,
            "radius_km": self.radius,
            "fetched": fetched,
            "nearest": nearest(None),
            "nearest_masjid": nearest("masjid"),
            "nearest_surau": nearest("surau"),
            "count": len(ranked),
            "counts": counts,
            "nearby": ranked[:NEARBY_LIMIT],
        }
