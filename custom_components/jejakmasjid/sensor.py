"""Sensors: nearest masjid/surau and how many are around, per person and for Home."""
from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
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
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .account import CONF_PERSON, AccountCoordinator
from .const import get_device_info
from .coordinator import HOME, JejakMasjidConfigEntry, JejakMasjidCoordinator
from .entity import JejakMasjidEntity

_LOGGER = logging.getLogger(__name__)

PARALLEL_UPDATES = 0

UID_PREFIX = "jejakmasjid_"


def _place_attrs(place: dict[str, Any] | None) -> dict[str, Any]:
    if not place:
        return {}
    return {
        "place_id": place["id"],
        "type": place["type"],
        "distance_km": place["distance_km"],
        "latitude": place["latitude"],
        "longitude": place["longitude"],
        "kursus_haji": place["kursus_haji"],
    }


def _nearby(loc: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {k: p[k] for k in ("id", "name", "type", "distance_km", "latitude", "longitude")}
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
    async_setup_account_entities(hass, entry, async_add_entities)


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


# --- PROTOTYPE: optional linked-account stats -------------------------------
ACCOUNT_UID_PREFIX = "jmaccount_"  # not UID_PREFIX, so the location clean-up leaves these alone


@dataclass(frozen=True, kw_only=True)
class JMAccountDescription(SensorEntityDescription):
    value_fn: Callable[[dict[str, Any]], Any]
    attrs_fn: Callable[[dict[str, Any]], dict[str, Any]] = lambda d: {}


PRAYERS = ("subuh", "zohor", "asar", "maghrib", "isyak")


def _p(d: dict[str, Any]) -> dict[str, Any]:
    return ((d.get("me") or {}).get("profile")) or {}


def _rank(d: dict[str, Any]) -> dict[str, Any]:
    return ((d.get("me") or {}).get("rank")) or {}


ACCOUNT_SENSORS: tuple[JMAccountDescription, ...] = (
    JMAccountDescription(
        key="account_checkins",
        translation_key="account_checkins",
        state_class=SensorStateClass.TOTAL_INCREASING,
        value_fn=lambda d: _p(d).get("totalCheckIns"),
        attrs_fn=lambda d: {"this_month": _p(d).get("monthlyCheckIns"), "last_visit": _p(d).get("lastVisitDate")},
    ),
    JMAccountDescription(
        key="account_masjids",
        translation_key="account_masjids",
        state_class=SensorStateClass.TOTAL_INCREASING,
        value_fn=lambda d: _p(d).get("uniqueMasjidsVisited"),
        attrs_fn=lambda d: {"this_month": _p(d).get("monthlyUniqueMasjids")},
    ),
    JMAccountDescription(
        key="account_streak",
        translation_key="account_streak",
        native_unit_of_measurement="d",
        value_fn=lambda d: (d.get("me") or {}).get("displayStreak", _p(d).get("currentStreak")),
        attrs_fn=lambda d: {
            "longest": _p(d).get("longestStreak"),
            **{f"{x}_streak": _p(d).get(f"{x}CurrentStreak") for x in PRAYERS},
        },
    ),
    JMAccountDescription(
        key="account_points",
        translation_key="account_points",
        state_class=SensorStateClass.TOTAL,
        value_fn=lambda d: _p(d).get("totalPoints"),
        attrs_fn=lambda d: {"this_month": _p(d).get("monthlyPoints")},
    ),
    JMAccountDescription(
        key="account_rank",
        translation_key="account_rank",
        value_fn=lambda d: _rank(d).get("globalRank"),
        attrs_fn=lambda d: {"monthly_rank": _rank(d).get("monthlyRank")},
    ),
    JMAccountDescription(
        key="account_achievements",
        translation_key="account_achievements",
        value_fn=lambda d: _p(d).get("achievementCount"),
    ),
)


def async_setup_account_entities(
    hass: HomeAssistant, entry: JejakMasjidConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Add stats sensors when an account is linked; drop them when it is not."""
    account = entry.runtime_data.account
    if account is None:
        ent_reg = er.async_get(hass)
        for reg in er.async_entries_for_config_entry(ent_reg, entry.entry_id):
            if reg.unique_id.startswith(ACCOUNT_UID_PREFIX):
                ent_reg.async_remove(reg.entity_id)
        return
    async_add_entities(JejakMasjidAccountSensor(account, entry, d) for d in ACCOUNT_SENSORS)


class JejakMasjidAccountSensor(CoordinatorEntity[AccountCoordinator], SensorEntity):
    """One stat from the linked Jejak Masjid account."""

    _attr_has_entity_name = True
    entity_description: JMAccountDescription

    def __init__(self, account: AccountCoordinator, entry: JejakMasjidConfigEntry, desc: JMAccountDescription) -> None:
        super().__init__(account)
        self.entity_description = desc
        self._attr_unique_id = f"{ACCOUNT_UID_PREFIX}{entry.entry_id}_{desc.key}"
        self._attr_device_info = get_device_info(entry.entry_id)
        self._person = entry.data.get(CONF_PERSON)
        state = account.hass.states.get(self._person) if self._person else None
        name = state.name if state else None
        # Named after the person it belongs to ("Zubir check-ins"); "My" when none is set.
        self._attr_translation_placeholders = {"person": name or "My"}

    @property
    def native_value(self) -> Any:
        return self.entity_description.value_fn(self.coordinator.data or {})

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        # Only the counts: never the email, photo URL or push token the payload also carries.
        attrs = self.entity_description.attrs_fn(self.coordinator.data or {})
        attrs = {**attrs, "stat": self.entity_description.key.removeprefix("account_")}  # for the stats card
        return {**attrs, "person": self._person} if self._person else attrs
