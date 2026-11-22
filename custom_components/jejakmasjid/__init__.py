"""Jejak Masjid: nearby masjid and surau for every person with GPS."""
from __future__ import annotations

import logging

from homeassistant.const import Platform
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import TrackStates, async_track_state_change_filtered
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

from .account import CONF_TOKEN, AccountCoordinator
from .card_registration import async_register_card, async_unregister_card
from .const import CACHE_STORAGE_VERSION, DOMAIN
from .coordinator import JejakMasjidConfigEntry, JejakMasjidCoordinator
from .services import async_setup_services

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SENSOR]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the jejakmasjid.find_nearby action."""
    async_setup_services(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: JejakMasjidConfigEntry) -> bool:
    """Set up Jejak Masjid from a config entry."""
    await async_register_card(hass)
    coordinator = JejakMasjidCoordinator(hass, entry)
    await coordinator.async_load_cache()
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    coordinator.account = None
    if CONF_TOKEN in entry.data:
        coordinator.account = AccountCoordinator(hass, entry)
        await coordinator.account.async_refresh()

    @callback
    def _person_moved(event: Event[EventStateChangedData]) -> None:
        """Refresh soon after a person's GPS changes (debounced by the coordinator)."""
        old, new = event.data["old_state"], event.data["new_state"]
        if new is None:
            return
        before = (old.attributes.get("latitude"), old.attributes.get("longitude")) if old else None
        after = (new.attributes.get("latitude"), new.attributes.get("longitude"))
        if before != after:
            hass.async_create_task(coordinator.async_request_refresh())

    # Track the whole person domain, so people added after setup are followed too
    # (TrackStates fields are positional: all_states, entities, domains).
    entry.async_on_unload(
        async_track_state_change_filtered(
            hass, TrackStates(False, set(), {"person"}), _person_moved
        ).async_remove
    )

    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def _async_options_updated(hass: HomeAssistant, entry: JejakMasjidConfigEntry) -> None:
    """Apply a new radius or update interval."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: JejakMasjidConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: JejakMasjidConfigEntry) -> None:
    """Drop the card's dashboard resource and the search cache when the integration is removed."""
    await async_unregister_card(hass)
    await Store(hass, CACHE_STORAGE_VERSION, f"{DOMAIN}.cache").async_remove()
