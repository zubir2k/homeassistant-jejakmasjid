"""Tests for the Jejak Masjid payload parser."""
from __future__ import annotations

import copy

from custom_components.jejakmasjid.api import parse_places

from .conftest import MOCK_GEOJSON


def test_type_guessed_from_name_when_payload_has_none() -> None:
    """Without a type field, the type comes from the place name."""
    places = {p["id"]: p for p in parse_places(MOCK_GEOJSON)}
    assert places["place-1"]["type"] == "surau"
    assert places["place-2"]["type"] == "masjid"


def test_type_from_payload_wins_over_name() -> None:
    """A type field sent by the API is used ahead of the name guess."""
    payload = copy.deepcopy(MOCK_GEOJSON)
    payload["features"][0]["properties"]["name"] = "Al-Ikhlas"
    payload["features"][0]["properties"]["type"] = "Surau"
    payload["features"][1]["properties"]["type"] = "MASJID"
    places = {p["id"]: p for p in parse_places(payload)}
    assert places["place-1"]["type"] == "surau"
    assert places["place-2"]["type"] == "masjid"


def test_blank_payload_type_falls_back_to_name() -> None:
    """An empty type field falls back to the name guess."""
    payload = copy.deepcopy(MOCK_GEOJSON)
    payload["features"][1]["properties"]["type"] = ""
    places = {p["id"]: p for p in parse_places(payload)}
    assert places["place-2"]["type"] == "masjid"
