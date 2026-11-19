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
                "name": "Surau Ar-Raudhah",
                "type": "surau",
                "latitude": 3.020018,
                "longitude": 101.790497,
                "kursus_haji": False,
            }
        ],
    ):
        result = await hass.services.async_call(
            DOMAIN,
            "find_nearby",
            {"latitude": 3.02192, "longitude": 101.79148, "radius": 3, "limit": 5},
            blocking=True,
            return_response=True,
        )

    assert result["count"] == 1
    assert len(result["places"]) == 1
    assert result["places"][0]["name"] == "Surau Ar-Raudhah"
