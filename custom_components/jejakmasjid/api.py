"""Small client for the public Jejak Masjid API."""
from __future__ import annotations

import math
import re
from typing import Any

import aiohttp

from .const import NEARBY_URL, USER_AGENT

_TIMEOUT = aiohttp.ClientTimeout(total=20)


class JejakMasjidError(Exception):
    """The API could not be reached or answered with something unexpected."""


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km."""
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


_TYPES = (
    ("masjid", re.compile(r"^\W*(masjid|mosque)\b", re.I)),
    ("surau", re.compile(r"^\W*(surau|musolla|musolah|musalla|prayer room|bilik solat)\b", re.I)),
    ("madrasah", re.compile(r"^\W*madrasah?\b", re.I)),
)


def _type_from_payload(raw: Any) -> str | None:
    """Map the API's own type field to ours, if it sends one; None when absent or unknown."""
    if not isinstance(raw, str) or not raw.strip():
        return None
    value = raw.strip().lower()
    if re.search(r"masjid|mosque", value):
        return "masjid"
    if re.search(r"surau|musolla|musalla|musolah|prayer|solat", value):
        return "surau"
    if re.search(r"madrasah?", value):
        return "madrasah"
    return "other"


def place_type(name: str) -> str:
    """Masjid, surau, madrasah or other, from the place name (the API has no type field)."""
    for kind, pattern in _TYPES:
        if pattern.search(name or ""):
            return kind
    if re.search(r"\b(surau|musolla|musalla|prayer room)\b", name or "", re.I):
        return "surau"
    if re.search(r"\b(masjid|mosque)\b", name or "", re.I):
        return "masjid"
    return "other"


def parse_places(payload: Any) -> list[dict[str, Any]]:
    """GeoJSON FeatureCollection -> list of places."""
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise JejakMasjidError("Unexpected response from Jejak Masjid")
    places = []
    for feature in payload.get("features") or []:
        try:
            lon, lat = feature["geometry"]["coordinates"][:2]
            props = feature.get("properties") or {}
            name = str(props.get("name") or "").strip()
            places.append(
                {
                    "id": str(props["id"]),
                    "name": name,
                    "type": _type_from_payload(props.get("type")) or place_type(name),
                    "latitude": float(lat),
                    "longitude": float(lon),
                    "kursus_haji": bool(props.get("has_kursus_asas_haji")),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return places


async def async_fetch_nearby(
    session: aiohttp.ClientSession, lat: float, lon: float, radius_km: int
) -> list[dict[str, Any]]:
    """Places within radius_km of a point."""
    # About 110 m precision is plenty for a 1-5 km search and keeps exact positions private
    params = {"lat": f"{lat:.3f}", "lng": f"{lon:.3f}", "radius": str(radius_km)}
    try:
        async with session.get(
            NEARBY_URL, params=params, headers={"User-Agent": USER_AGENT}, timeout=_TIMEOUT
        ) as resp:
            if resp.status != 200:
                raise JejakMasjidError(f"Jejak Masjid answered HTTP {resp.status}")
            payload = await resp.json(content_type=None)
    except (aiohttp.ClientError, TimeoutError, ValueError) as err:
        raise JejakMasjidError(f"Cannot reach Jejak Masjid: {err}") from err
    return parse_places(payload)


def rank(places: list[dict[str, Any]], lat: float, lon: float) -> list[dict[str, Any]]:
    """Places with distance_km from (lat, lon), nearest first."""
    out = [
        {**p, "distance_km": round(haversine_km(lat, lon, p["latitude"], p["longitude"]), 2)}
        for p in places
    ]
    out.sort(key=lambda p: p["distance_km"])
    return out
