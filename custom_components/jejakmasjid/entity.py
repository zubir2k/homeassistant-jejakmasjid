"""Base entity for Jejak Masjid."""
from __future__ import annotations

from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import get_device_info
from .coordinator import JejakMasjidCoordinator


class JejakMasjidEntity(CoordinatorEntity[JejakMasjidCoordinator]):
    """Named in the context of the Jejak Masjid service device."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: JejakMasjidCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_device_info = get_device_info(coordinator.config_entry.entry_id)
