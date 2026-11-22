"""Diagnostics for Jejak Masjid, with locations redacted."""
from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.core import HomeAssistant

from .coordinator import JejakMasjidConfigEntry

TO_REDACT = {"latitude", "longitude", "nearby", "nearest", "nearest_masjid", "nearest_surau", "name", "account_token", "account_email"}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: JejakMasjidConfigEntry
) -> dict[str, Any]:
    coordinator = entry.runtime_data
    return {
        "options": dict(entry.options),
        "account_linked": "account_token" in entry.data,
        "last_update_success": coordinator.last_update_success,
        "update_interval": str(coordinator.update_interval),
        "api_calls_since_start": coordinator.api_calls,
        "cached_searches": len(coordinator._pool),
        "locations": async_redact_data(coordinator.data or {}, TO_REDACT),
    }
