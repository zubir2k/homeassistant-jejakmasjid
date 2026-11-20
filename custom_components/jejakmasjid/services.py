"""jejakmasjid.find_nearby: masjid and surau around any point, for automations and Assist."""
from __future__ import annotations

import voluptuous as vol

from homeassistant.const import ATTR_LATITUDE, ATTR_LONGITUDE
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from jejakmasjid import JejakMasjidError, async_fetch_nearby, rank
from .const import DEFAULT_RADIUS, DOMAIN, MAX_RADIUS, MIN_RADIUS, PLACE_TYPES

SERVICE_FIND_NEARBY = "find_nearby"
ATTR_ENTITY_ID = "entity_id"
ATTR_RADIUS = "radius"
ATTR_TYPE = "type"
ATTR_LIMIT = "limit"

SCHEMA = vol.Schema(
    {
        vol.Exclusive(ATTR_ENTITY_ID, "where"): cv.entity_id,
        vol.Inclusive(ATTR_LATITUDE, "coords"): cv.latitude,
        vol.Inclusive(ATTR_LONGITUDE, "coords"): cv.longitude,
        vol.Optional(ATTR_RADIUS, default=DEFAULT_RADIUS): vol.All(
            vol.Coerce(int), vol.Range(min=MIN_RADIUS, max=MAX_RADIUS)
        ),
        vol.Optional(ATTR_TYPE): vol.In(PLACE_TYPES),
        vol.Optional(ATTR_LIMIT, default=10): vol.All(vol.Coerce(int), vol.Range(min=1, max=100)),
    }
)


def async_setup_services(hass: HomeAssistant) -> None:
    """Register the integration's actions."""

    async def _find_nearby(call: ServiceCall) -> ServiceResponse:
        data = call.data
        if ATTR_LATITUDE in data:
            lat, lon = data[ATTR_LATITUDE], data[ATTR_LONGITUDE]
        else:
            entity_id = data.get(ATTR_ENTITY_ID, "zone.home")
            state = hass.states.get(entity_id)
            if state is None or state.attributes.get(ATTR_LATITUDE) is None:
                raise ServiceValidationError(
                    translation_domain=DOMAIN,
                    translation_key="no_location",
                    translation_placeholders={"entity_id": entity_id},
                )
            lat = float(state.attributes[ATTR_LATITUDE])
            lon = float(state.attributes[ATTR_LONGITUDE])
        try:
            places = await async_fetch_nearby(async_get_clientsession(hass), lat, lon, data[ATTR_RADIUS])
        except JejakMasjidError as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="cannot_connect"
            ) from err
        ranked = rank(places, lat, lon)
        if ATTR_TYPE in data:
            ranked = [p for p in ranked if p["type"] == data[ATTR_TYPE]]
        return {"count": len(ranked), "places": ranked[: data[ATTR_LIMIT]]}

    hass.services.async_register(
        DOMAIN,
        SERVICE_FIND_NEARBY,
        _find_nearby,
        schema=SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
