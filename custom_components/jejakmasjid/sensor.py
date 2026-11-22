"""Sensors: nearest masjid/surau and how many are around, per person and for Home."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
import logging
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import UnitOfLength
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import HOME, JejakMasjidConfigEntry, JejakMasjidCoordinator
from .entity import JejakMasjidEntity

_LOGGER = logging.getLogger(__name__)

PARALLEL_UPDATES = 0

UID_PREFIX = "jejakmasjid_"


def _place_attrs(place: dict[str, Any] | None) -> dict[str, Any]:
    if not place:
        return {}
    attrs: dict[str, Any] = {
        "place_id": place["id"],
        "type": place["type"],
        "distance_km": place["distance_km"],
        "latitude": place["latitude"],
        "longitude": place["longitude"],
        "kursus_haji": place.get("kursus_haji", False),
    }
    if place.get("distance_m") is not None:
        attrs["distance_m"] = place["distance_m"]
    if place.get("direction"):
        attrs["direction"] = place["direction"]
    if place.get("url"):
        attrs["url"] = place["url"]
    return attrs


def _nearby(loc: dict[str, Any]) -> list[dict[str, Any]]:
    keys = ("id", "name", "type", "distance_km", "distance_m", "direction", "url", "latitude", "longitude")
    return [
        {k: p[k] for k in keys if k in p and p[k] is not None}
        for p in loc["nearby"]
    ]


@dataclass(frozen=True, kw_only=True)
class JMSensorDescription(SensorEntityDescription):
    value_fn: Callable[[dict[str, Any]], Any]
    attrs_fn: Callable[[dict[str, Any]], dict[str, Any]] = lambda loc: {}


SENSORS: tuple[JMSensorDescription, ...] = (
    JMSensorDescription(
        key="nearest",
        translation_key="nearest",
        value_fn=lambda loc: (loc["nearest"] or {}).get("name"),
        attrs_fn=lambda loc: {
            **_place_attrs(loc["nearest"]),
            "radius_km": loc["radius_km"],
            "fetched": loc["fetched"].isoformat() if loc.get("fetched") else None,
            "nearby": _nearby(loc),
        },
    ),
    JMSensorDescription(
        key="nearest_distance",
        translation_key="nearest_distance",
        device_class=SensorDeviceClass.DISTANCE,
        native_unit_of_measurement=UnitOfLength.KILOMETERS,
        state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=2,
        value_fn=lambda loc: (loc["nearest"] or {}).get("distance_km"),
    ),
    JMSensorDescription(
        key="nearest_masjid",
        translation_key="nearest_masjid",
        value_fn=lambda loc: (loc["nearest_masjid"] or {}).get("name"),
        attrs_fn=lambda loc: _place_attrs(loc["nearest_masjid"]),
    ),
    JMSensorDescription(
        key="nearest_surau",
        translation_key="nearest_surau",
        value_fn=lambda loc: (loc["nearest_surau"] or {}).get("name"),
        attrs_fn=lambda loc: _place_attrs(loc["nearest_surau"]),
    ),
    JMSensorDescription(
        key="count",
        translation_key="count",
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement="places",
        value_fn=lambda loc: loc["count"],
        attrs_fn=lambda loc: {**loc["counts"], "radius_km": loc["radius_km"]},
    ),
)


def _slug(source: str) -> str:
    return "home" if source == HOME else source.split(".", 1)[1]


async def async_setup_entry(
    hass: HomeAssistant, entry: JejakMasjidConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Add sensors for each tracked location as it appears; remove them when it goes."""
    coordinator = entry.runtime_data
    added: set[str] = set()

    @callback
    def _sync() -> None:
        if not coordinator.last_update_success or coordinator.data is None:
            return  # never remove anything on the strength of a failed update
        wanted: set[str] = set()
        new = []
        for source in sorted(coordinator.data):
            for desc in SENSORS:
                uid = f"{UID_PREFIX}{_slug(source)}_{desc.key}"
                wanted.add(uid)
                if uid not in added:
                    new.append(JejakMasjidSensor(coordinator, source, desc))
                    added.add(uid)
        if new:
            async_add_entities(new)

        ent_reg = er.async_get(hass)
        for reg in er.async_entries_for_config_entry(ent_reg, entry.entry_id):
            if reg.domain == "sensor" and reg.unique_id.startswith(UID_PREFIX) and reg.unique_id not in wanted:
                _LOGGER.info("Removing %s: location no longer tracked", reg.entity_id)
                ent_reg.async_remove(reg.entity_id)
                added.discard(reg.unique_id)

    _sync()
    entry.async_on_unload(coordinator.async_add_listener(_sync))


class JejakMasjidSensor(JejakMasjidEntity, SensorEntity):
    """One reading for one person (or Home)."""

    # The full nearby list is for the card; keep it out of the recorder database.
    _unrecorded_attributes = frozenset({"nearby"})

    entity_description: JMSensorDescription

    def __init__(
        self, coordinator: JejakMasjidCoordinator, source: str, description: JMSensorDescription
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._source = source
        slug = _slug(source)
        self._attr_unique_id = f"{UID_PREFIX}{slug}_{description.key}"
        loc = (coordinator.data or {}).get(source) or {}
        self._attr_translation_placeholders = {"who": loc.get("name", slug)}

    @property
    def _loc(self) -> dict[str, Any] | None:
        return (self.coordinator.data or {}).get(self._source)

    @property
    def available(self) -> bool:
        return super().available and self._loc is not None

    @property
    def native_value(self) -> Any:
        return self.entity_description.value_fn(self._loc) if self._loc else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        if not self._loc:
            return {}
        return {**self.entity_description.attrs_fn(self._loc), "source": self._source}
