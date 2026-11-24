"""Tests for Jejak Masjid config and options flows."""
from __future__ import annotations

from unittest.mock import patch

from homeassistant import config_entries
from homeassistant.const import CONF_SCAN_INTERVAL
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.jejakmasjid.const import CONF_DATA_SOURCE, CONF_RADIUS, DOMAIN


async def test_user_flow_success(hass: HomeAssistant) -> None:
    """Test standard user flow setup."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "user"
    assert result["errors"] == {}

    with patch(
        "custom_components.jejakmasjid.config_flow._async_can_connect",
        return_value=True,
    ):
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_RADIUS: 4, CONF_SCAN_INTERVAL: 10},
        )

    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert result["title"] == "Jejak Masjid"
    assert result["data"] == {}
    assert result["options"] == {CONF_RADIUS: 4, CONF_SCAN_INTERVAL: 10}


async def test_user_flow_cannot_connect(hass: HomeAssistant) -> None:
    """Test user flow with connection error."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )

    with patch(
        "custom_components.jejakmasjid.config_flow._async_can_connect",
        return_value=False,
    ):
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_RADIUS: 3, CONF_SCAN_INTERVAL: 5},
        )

    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "user"
    assert result["errors"] == {"base": "cannot_connect"}


async def test_user_flow_single_instance(hass: HomeAssistant) -> None:
    """Test duplicate configuration is aborted."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Jejak Masjid",
        unique_id=DOMAIN,
        data={},
        options={CONF_RADIUS: 3, CONF_SCAN_INTERVAL: 5},
    )
    entry.add_to_hass(hass)

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] == FlowResultType.ABORT
    assert result["reason"] in ("already_configured", "single_instance_allowed")


async def test_options_flow(hass: HomeAssistant) -> None:
    """Test options flow to update radius and interval."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Jejak Masjid",
        unique_id=DOMAIN,
        data={},
        options={CONF_RADIUS: 3, CONF_SCAN_INTERVAL: 5},
    )
    entry.add_to_hass(hass)

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] == FlowResultType.MENU
    assert result["step_id"] == "init"

    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {"next_step_id": "settings"},
    )
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "settings"

    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {CONF_RADIUS: 5, CONF_SCAN_INTERVAL: 15},
    )
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert result["data"] == {CONF_RADIUS: 5, CONF_SCAN_INTERVAL: 15}


async def test_options_flow_data_source(hass: HomeAssistant) -> None:
    """Test options flow with optional data_source configuration."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Jejak Masjid",
        unique_id=DOMAIN,
        data={},
        options={CONF_RADIUS: 3, CONF_SCAN_INTERVAL: 5},
    )
    entry.add_to_hass(hass)

    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {"next_step_id": "settings"},
    )
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "settings"

    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {CONF_RADIUS: 4, CONF_SCAN_INTERVAL: 10, CONF_DATA_SOURCE: "map"},
    )
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert result["data"] == {CONF_RADIUS: 4, CONF_SCAN_INTERVAL: 10, CONF_DATA_SOURCE: "map"}
