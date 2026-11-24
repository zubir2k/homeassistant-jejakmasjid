"""Config flow for Jejak Masjid."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp
import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.const import CONF_SCAN_INTERVAL
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    EntitySelector,
    EntitySelectorConfig,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .account import (
    CONF_EMAIL,
    CONF_PERSON,
    CONF_TOKEN,
    AccountError,
    async_send_otp,
    async_verify_otp,
)
from .const import (
    CONF_DATA_SOURCE,
    CONF_RADIUS,
    DEFAULT_DATA_SOURCE,
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

_LOGGER = logging.getLogger(__name__)

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


DATA_SOURCE_SELECTOR = TextSelector(TextSelectorConfig(type=TextSelectorType.TEXT))


def _schema(radius: int, interval: int) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(CONF_RADIUS, default=radius): RADIUS_SELECTOR,
            vol.Required(CONF_SCAN_INTERVAL, default=interval): INTERVAL_SELECTOR,
        }
    )


def _options_schema(radius: int, interval: int, data_source: str = DEFAULT_DATA_SOURCE) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(CONF_RADIUS, default=radius): RADIUS_SELECTOR,
            vol.Required(CONF_SCAN_INTERVAL, default=interval): INTERVAL_SELECTOR,
            vol.Optional(CONF_DATA_SOURCE, default=data_source): DATA_SOURCE_SELECTOR,
        }
    )


def _clean(user_input: dict[str, Any]) -> dict[str, int]:
    return {
        CONF_RADIUS: int(user_input[CONF_RADIUS]),
        CONF_SCAN_INTERVAL: int(user_input[CONF_SCAN_INTERVAL]),
    }


def _clean_options(user_input: dict[str, Any]) -> dict[str, Any]:
    cleaned: dict[str, Any] = _clean(user_input)
    if CONF_DATA_SOURCE in user_input:
        raw_source = str(user_input[CONF_DATA_SOURCE] or "").strip().lower()
        if raw_source:
            cleaned[CONF_DATA_SOURCE] = raw_source
    return cleaned


async def _async_can_connect(hass: HomeAssistant) -> bool:
    try:
        async with async_get_clientsession(hass).get(
            HEALTH_URL, headers={"User-Agent": USER_AGENT}, timeout=aiohttp.ClientTimeout(total=15)
        ) as resp:
            return resp.status == 200
    except (aiohttp.ClientError, TimeoutError):
        return False


def _person_field(default: str | None) -> dict[Any, Any]:
    key = vol.Optional(CONF_PERSON, description={"suggested_value": default}) if default else vol.Optional(CONF_PERSON)
    return {key: EntitySelector(EntitySelectorConfig(domain="person"))}


def _with_person(data: dict[str, Any], person: str | None) -> dict[str, Any]:
    data.pop(CONF_PERSON, None)
    return {**data, CONF_PERSON: person} if person else data


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
    """Settings, plus an optional account link (PROTOTYPE) for personal stats."""

    _email: str = ""
    _person: str | None = None

    def _own_person(self) -> str | None:
        """The person entity of whoever opened the options, as a sensible default."""
        user_id = self.context.get("user_id")
        for state in self.hass.states.async_all("person"):
            if user_id and state.attributes.get("user_id") == user_id:
                return state.entity_id
        return None

    async def async_step_person(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Re-assign the linked account to another person (no new sign-in)."""
        if user_input is not None:
            self.hass.config_entries.async_update_entry(
                self.config_entry, data=_with_person(dict(self.config_entry.data), user_input.get(CONF_PERSON))
            )
            return self.async_create_entry(data=dict(self.config_entry.options))
        current = self.config_entry.data.get(CONF_PERSON) or self._own_person()
        return self.async_show_form(step_id="person", data_schema=vol.Schema(_person_field(current)))

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        linked = CONF_TOKEN in self.config_entry.data
        return self.async_show_menu(
            step_id="init", menu_options=["settings", "person", "unlink"] if linked else ["settings", "link"]
        )

    async def async_step_settings(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=_clean_options(user_input))
        opts = self.config_entry.options
        return self.async_show_form(
            step_id="settings",
            data_schema=_options_schema(
                opts.get(CONF_RADIUS, DEFAULT_RADIUS),
                opts.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
                opts.get(CONF_DATA_SOURCE, DEFAULT_DATA_SOURCE),
            ),
        )

    async def async_step_link(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Ask for the account email and have Jejak Masjid send a code."""
        errors: dict[str, str] = {}
        if user_input is not None:
            self._email = user_input[CONF_EMAIL].strip().lower()
            self._person = user_input.get(CONF_PERSON)
            try:
                await async_send_otp(self.hass, self._email)
            except AccountError as err:
                _LOGGER.warning("Send OTP error in config flow: %s", err)
                errors["base"] = "otp_send_failed"
            else:
                return await self.async_step_otp()
        return self.async_show_form(
            step_id="link",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_EMAIL): TextSelector(TextSelectorConfig(type=TextSelectorType.EMAIL)),
                    **_person_field(self._own_person()),
                }
            ),
            errors=errors,
        )

    async def async_step_otp(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Exchange the emailed code for a session token kept in the entry data."""
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                token = await async_verify_otp(self.hass, self._email, user_input["otp"].strip())
            except AccountError as err:
                _LOGGER.warning("Verify OTP error in config flow: %s", err)
                errors["base"] = "invalid_otp"
            else:
                self.hass.config_entries.async_update_entry(
                    self.config_entry,
                    data=_with_person(
                        {**self.config_entry.data, CONF_EMAIL: self._email, CONF_TOKEN: token}, self._person
                    ),
                )
                return self.async_create_entry(data=dict(self.config_entry.options))
        return self.async_show_form(
            step_id="otp",
            data_schema=vol.Schema({vol.Required("otp"): str}),
            description_placeholders={"email": self._email},
            errors=errors,
        )

    async def async_step_unlink(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Forget the session token (the account itself is untouched)."""
        if user_input is not None:
            data = {k: v for k, v in self.config_entry.data.items() if k not in (CONF_TOKEN, CONF_EMAIL, CONF_PERSON)}
            self.hass.config_entries.async_update_entry(self.config_entry, data=data)
            return self.async_create_entry(data=dict(self.config_entry.options))
        return self.async_show_form(step_id="unlink", data_schema=vol.Schema({}))
