"""Jejak Masjid account support."""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from jejakmasjid import (
    JejakMasjidAuthError,
    JejakMasjidError,
    async_fetch_user_profile,
    async_send_email_otp,
    async_verify_email_otp,
)

from .const import DOMAIN, USER_AGENT

_LOGGER = logging.getLogger(__name__)

CONF_TOKEN = "account_token"
CONF_EMAIL = "account_email"
CONF_PERSON = "account_person"  # the person entity these stats belong to
STATS_INTERVAL = timedelta(hours=6)


class AccountAuthError(Exception):
    """The session token was refused (expired or revoked)."""


class AccountError(Exception):
    """Jejak Masjid could not be reached or rejected the request."""


async def async_send_otp(hass: HomeAssistant, email: str) -> None:
    """Ask Jejak Masjid to email a sign-in code."""
    session = async_get_clientsession(hass)
    try:
        await async_send_email_otp(session, email, user_agent=USER_AGENT)
    except (JejakMasjidAuthError, JejakMasjidError) as err:
        raise AccountError(str(err)) from err


async def async_verify_otp(hass: HomeAssistant, email: str, otp: str) -> str:
    """Exchange the emailed code for a session token."""
    session = async_get_clientsession(hass)
    try:
        _data, token = await async_verify_email_otp(session, email, otp, user_agent=USER_AGENT)
        return token
    except (JejakMasjidAuthError, JejakMasjidError) as err:
        raise AccountError(str(err)) from err


class AccountCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Polls the linked account's stats every few hours."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(hass, _LOGGER, name=f"{DOMAIN}_account", update_interval=STATS_INTERVAL)
        self._entry = entry
        self.api_calls = 0

    async def _async_update_data(self) -> dict[str, Any]:
        token = self._entry.data.get(CONF_TOKEN)
        if not token:
            return {}

        session = async_get_clientsession(self.hass)
        self.api_calls += 1
        try:
            profile_data = await async_fetch_user_profile(session, token, user_agent=USER_AGENT)
            data = {"me": profile_data}
        except JejakMasjidAuthError as err:
            ir.async_create_issue(
                self.hass,
                DOMAIN,
                "account_relink",
                is_fixable=False,
                severity=ir.IssueSeverity.WARNING,
                translation_key="account_relink",
            )
            raise UpdateFailed("Jejak Masjid session expired") from err
        except JejakMasjidError as err:
            raise UpdateFailed(f"Jejak Masjid account error: {err}") from err

        ir.async_delete_issue(self.hass, DOMAIN, "account_relink")
        return data


def find_number(obj: Any, *keys: str) -> Any:
    """First numeric value under any of these keys, searched depth-first."""
    if isinstance(obj, dict):
        for k in keys:
            if isinstance(obj.get(k), (int, float)) and not isinstance(obj.get(k), bool):
                return obj[k]
        for v in obj.values():
            if (found := find_number(v, *keys)) is not None:
                return found
    elif isinstance(obj, list):
        for v in obj:
            if (found := find_number(v, *keys)) is not None:
                return found
    return None
