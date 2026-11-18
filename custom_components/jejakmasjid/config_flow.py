"""Config flow for Jejak Masjid."""
from __future__ import annotations

from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_SCAN_INTERVAL
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
)

from .const import (
    CONF_RADIUS,
    DEFAULT_RADIUS,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    HEALTH_URL,
    MAX_RADIUS,
    MAX_SCAN_INTERVAL,
    MIN_RADIUS,
    MIN_SCAN_INTERVAL,
    USER_AGENT,
)

RADIUS_SELECTOR = NumberSelector(
    NumberSelectorConfig(
        min=MIN_RADIUS, max=MAX_RADIUS, step=1, mode=NumberSelectorMode.SLIDER, unit_of_measurement="km"
    )
)
INTERVAL_SELECTOR = NumberSelector(
    NumberSelectorConfig(
        min=MIN_SCAN_INTERVAL, max=MAX_SCAN_INTERVAL, step=1, mode=NumberSelectorMode.BOX, unit_of_measurement="min"
    )
)


def _schema(radius: int, interval: int) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(CONF_RADIUS, default=radius): RADIUS_SELECTOR,
            vol.Required(CONF_SCAN_INTERVAL, default=interval): INTERVAL_SELECTOR,
        }
    )


def _clean(user_input: dict[str, Any]) -> dict[str, int]:
    return {
        CONF_RADIUS: int(user_input[CONF_RADIUS]),
        CONF_SCAN_INTERVAL: int(user_input[CONF_SCAN_INTERVAL]),
    }


async def _async_can_connect(hass: HomeAssistant) -> bool:
    try:
        async with async_get_clientsession(hass).get(
            HEALTH_URL, headers={"User-Agent": USER_AGENT}, timeout=aiohttp.ClientTimeout(total=15)
        ) as resp:
            return resp.status == 200
    except (aiohttp.ClientError, TimeoutError):
        return False


class JejakMasjidConfigFlow(ConfigFlow, domain=DOMAIN):
    """Single entry: it follows every person with GPS plus the Home zone."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        errors: dict[str, str] = {}
        if user_input is not None:
            if await _async_can_connect(self.hass):
                return self.async_create_entry(title="Jejak Masjid", data={}, options=_clean(user_input))
            errors["base"] = "cannot_connect"
        user_input = user_input or {}
        return self.async_show_form(
            step_id="user",
            data_schema=_schema(
                user_input.get(CONF_RADIUS, DEFAULT_RADIUS),
                user_input.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
            ),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return JejakMasjidOptionsFlow()


class JejakMasjidOptionsFlow(OptionsFlow):
    """Change radius and update interval."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=_clean(user_input))
        opts = self.config_entry.options
        return self.async_show_form(
            step_id="init",
            data_schema=_schema(
                opts.get(CONF_RADIUS, DEFAULT_RADIUS), opts.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
            ),
        )
