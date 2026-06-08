"""Keypad helper entities."""

from __future__ import annotations

import logging
import re

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, KEYPAD_DISABLED, KEYPAD_ENABLED, KEYPAD_TYPE_FIRE, KEYPAD_TYPE_INTRUSION
from .coordinator import AlarmZoneCoordinator

_LOGGER = logging.getLogger(__name__)


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


class KeypadManager:
    """Manage keypad helper entities."""

    def __init__(self, hass: HomeAssistant, coordinator: AlarmZoneCoordinator) -> None:
        self.hass = hass
        self.coordinator = coordinator
        self._entities: dict[int, KeypadSensor] = {}
        self._async_add_entities = None

    def set_add_entities_callback(self, callback) -> None:
        """Store platform add_entities callback."""
        self._async_add_entities = callback

    async def async_setup(self) -> None:
        await self.sync_keypads()

    async def sync_keypads(self) -> None:
        """Create keypad entities for enabled keypads."""
        new_entities = []
        for keypad in self.coordinator.keypad_store.keypads:
            kid = keypad["keypad_id"]
            if keypad.get("enabled") == KEYPAD_ENABLED and kid not in self._entities:
                entity = KeypadSensor(self.coordinator, keypad)
                self._entities[kid] = entity
                new_entities.append(entity)
        if new_entities and self._async_add_entities:
            self._async_add_entities(new_entities)

    def get_entities(self) -> list[KeypadSensor]:
        return list(self._entities.values())


class KeypadSensor(CoordinatorEntity, SensorEntity):
    """Keypad state sensor for Lovelace card."""

    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator: AlarmZoneCoordinator, keypad: dict) -> None:
        super().__init__(coordinator)
        self._keypad = keypad
        self._attr_unique_id = f"{DOMAIN}_keypad_{keypad['keypad_id']}"
        slug = _slug(keypad.get("keypad_name", f"keypad_{keypad['keypad_id']}"))
        prefix = "fire_alarm" if keypad.get("keypad_type") == KEYPAD_TYPE_FIRE else "intrusion_alarm"
        self.entity_id = f"sensor.{prefix}_keypad_{slug}"
        self._attr_name = keypad.get("helper_name", f"Keypad {keypad['keypad_id']}")

    @property
    def keypad_id(self) -> int:
        return self._keypad["keypad_id"]

    @callback
    def _handle_coordinator_update(self) -> None:
        for k in self.coordinator.keypad_store.keypads:
            if k["keypad_id"] == self.keypad_id:
                self._keypad = k
                break
        self.async_write_ha_state()

    @property
    def extra_state_attributes(self) -> dict:
        return self.coordinator.get_keypad_state(self._keypad)

    @property
    def native_value(self) -> str:
        attrs = self.extra_state_attributes
        return attrs.get("status_line1", "").strip()


async def async_setup_entry(
    hass: HomeAssistant,
    entry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up keypad platform."""
    coordinator: AlarmZoneCoordinator = hass.data[DOMAIN]["coordinator"]
    manager: KeypadManager = hass.data[DOMAIN]["keypad_manager"]
    async_add_entities(manager.get_entities())
