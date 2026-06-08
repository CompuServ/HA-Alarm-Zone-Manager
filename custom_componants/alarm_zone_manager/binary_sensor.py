"""Binary sensor platform for zones."""

from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import ACTION_DISABLED, DOMAIN
from .coordinator import AlarmZoneCoordinator


class ZoneBinarySensor(CoordinatorEntity, BinarySensorEntity):
    """Zone alarm binary sensor."""

    def __init__(self, coordinator: AlarmZoneCoordinator, zone: dict) -> None:
        super().__init__(coordinator)
        self._zone = zone
        self._attr_unique_id = f"{DOMAIN}_zone_{zone['zone_id']}"
        self.entity_id = f"binary_sensor.zone_{zone['zone_id']}_alarm"
        self._attr_name = f"Zone {zone['zone_id']} Alarm"

    @property
    def zone_id(self) -> int:
        return self._zone["zone_id"]

    @callback
    def _handle_coordinator_update(self) -> None:
        for z in self.coordinator.zone_store.zones:
            if z["zone_id"] == self.zone_id:
                self._zone = z
                break
        self.async_write_ha_state()

    @property
    def is_on(self) -> bool:
        return bool(self._zone.get("in_alarm"))


async def async_setup_entry(
    hass: HomeAssistant,
    entry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up binary sensors for configured zones."""
    coordinator: AlarmZoneCoordinator = hass.data[DOMAIN]["coordinator"]
    entities = []
    for zone in coordinator.zone_store.zones:
        if zone.get("input_entity_id"):
            entities.append(ZoneBinarySensor(coordinator, zone))
    async_add_entities(entities)
