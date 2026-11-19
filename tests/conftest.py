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
                "coordinates": [101.790497, 3.020018],
            },
            "properties": {
                "id": "place-1",
                "name": "Surau Ar-Raudhah",
                "has_kursus_asas_haji": False,
            },
        },
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [101.785287, 3.024986],
            },
            "properties": {
                "id": "place-2",
                "name": "Masjid Saujana Impian",
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
                "name": "Surau Ar-Raudhah",
                "type": "surau",
                "latitude": 3.020018,
                "longitude": 101.790497,
                "kursus_haji": False,
            },
            {
                "id": "place-2",
                "name": "Masjid Saujana Impian",
                "type": "masjid",
                "latitude": 3.024986,
                "longitude": 101.785287,
                "kursus_haji": True,
            },
        ],
    ) as mock:
        yield mock
