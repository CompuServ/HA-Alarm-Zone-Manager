"""Sensor platform for keypad helpers."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .keypad import async_setup_entry as keypad_setup


async def async_setup_entry(
    hass: HomeAssistant,
    entry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Delegate to keypad setup."""
    from .const import DOMAIN

    manager = hass.data[DOMAIN]["keypad_manager"]
    manager.set_add_entities_callback(async_add_entities)
    await keypad_setup(hass, entry, async_add_entities)
