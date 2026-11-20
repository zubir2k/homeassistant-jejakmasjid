"""Fixtures for Jejak Masjid integration tests."""
from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest

MOCK_GEOJSON: dict[str, Any] = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [101.69170, 3.14440],
            },
            "properties": {
                "id": "place-1",
                "name": "Surau Al-Falah",
                "has_kursus_asas_haji": False,
            },
        },
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [101.69350, 3.14780],
            },
            "properties": {
                "id": "place-2",
                "name": "Masjid Negara",
                "has_kursus_asas_haji": True,
            },
        },
    ],
}


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Enable custom integrations in tests."""
    return


@pytest.fixture
def mock_fetch_nearby():
    """Mock the external Jejak Masjid API call."""
    with patch(
        "custom_components.jejakmasjid.coordinator.async_fetch_nearby",
        return_value=[
            {
                "id": "place-1",
                "name": "Surau Al-Falah",
                "type": "surau",
                "latitude": 3.14440,
                "longitude": 101.69170,
                "kursus_haji": False,
            },
            {
                "id": "place-2",
                "name": "Masjid Negara",
                "type": "masjid",
                "latitude": 3.14780,
                "longitude": 101.69350,
                "kursus_haji": True,
            },
        ],
    ) as mock:
        yield mock
