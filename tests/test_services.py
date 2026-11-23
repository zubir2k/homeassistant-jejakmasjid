"""Tests for Jejak Masjid services."""
from __future__ import annotations

from unittest.mock import patch

from homeassistant.core import HomeAssistant

from custom_components.jejakmasjid.const import DOMAIN
from custom_components.jejakmasjid.services import async_setup_services


async def test_find_nearby_service(hass: HomeAssistant) -> None:
    """Test the find_nearby service execution."""
    async_setup_services(hass)

    with patch(
        "custom_components.jejakmasjid.services.async_fetch_nearby",
        return_value=[
            {
                "id": "place-1",
                "name": "Surau Al-Falah",
                "type": "surau",
                "latitude": 3.14440,
                "longitude": 101.69170,
                "kursus_haji": False,
            }
        ],
    ):
        result = await hass.services.async_call(
            DOMAIN,
            "find_nearby",
            {"latitude": 3.14440, "longitude": 101.69170, "radius": 3, "limit": 5},
            blocking=True,
            return_response=True,
        )

    assert result["count"] == 1
    assert result["mode"] == "ha"
    assert len(result["places"]) == 1
    assert result["places"][0]["name"] == "Surau Al-Falah"
