"""Tests for Jejak Masjid integration lifecycle."""
from __future__ import annotations

from unittest.mock import patch

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.jejakmasjid.const import CONF_RADIUS, DOMAIN


async def test_setup_and_unload(hass: HomeAssistant, mock_fetch_nearby) -> None:
    """Test setting up and unloading the integration."""
    hass.states.async_set("zone.home", "0", {"latitude": 3.14440, "longitude": 101.69170})
    hass.states.async_set("person.test", "home", {"latitude": 3.14440, "longitude": 101.69170})

    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Jejak Masjid",
        unique_id=DOMAIN,
        data={},
        options={CONF_RADIUS: 3},
    )
    entry.add_to_hass(hass)

    with patch("custom_components.jejakmasjid.card_registration.async_register_card"):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()

    assert entry.runtime_data is not None

    with patch("custom_components.jejakmasjid.card_registration.async_unregister_card"):
        assert await hass.config_entries.async_unload(entry.entry_id)
        await hass.async_block_till_done()
