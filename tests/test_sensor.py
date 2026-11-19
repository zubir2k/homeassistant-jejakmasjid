"""Tests for Jejak Masjid sensors."""
from __future__ import annotations

from unittest.mock import patch

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.jejakmasjid.const import CONF_RADIUS, DOMAIN


async def test_sensors_created_and_updated(hass: HomeAssistant, mock_fetch_nearby) -> None:
    """Test that sensors are properly populated for tracked persons and Home."""
    hass.states.async_set("zone.home", "0", {"latitude": 3.02192, "longitude": 101.79148})
    hass.states.async_set(
        "person.test", "home", {"latitude": 3.02190, "longitude": 101.79150, "friendly_name": "Test User"}
    )

    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Jejak Masjid",
        unique_id=DOMAIN,
        data={},
        options={CONF_RADIUS: 5},
    )
    entry.add_to_hass(hass)

    with patch("custom_components.jejakmasjid.card_registration.async_register_card"):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()

    ent_reg = er.async_get(hass)
    entity_id = ent_reg.async_get_entity_id("sensor", DOMAIN, "jejakmasjid_home_nearest")
    assert entity_id is not None
    state = hass.states.get(entity_id)
    assert state is not None
    assert state.state == "Surau Ar-Raudhah"
    assert "nearby" in state.attributes

    dist_id = ent_reg.async_get_entity_id("sensor", DOMAIN, "jejakmasjid_home_nearest_distance")
    assert dist_id is not None
    dist_state = hass.states.get(dist_id)
    assert dist_state is not None
    assert float(dist_state.state) >= 0

    count_id = ent_reg.async_get_entity_id("sensor", DOMAIN, "jejakmasjid_home_count")
    assert count_id is not None
    count_state = hass.states.get(count_id)
    assert count_state is not None
    assert count_state.state == "2"
