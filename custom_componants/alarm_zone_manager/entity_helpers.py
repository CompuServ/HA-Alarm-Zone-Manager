"""Entity and registry helpers."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er


def entity_exists(hass: HomeAssistant, entity_id: str | None) -> bool:
    """Check if entity exists."""
    if not entity_id:
        return False
    return hass.states.get(entity_id) is not None or (
        er.async_get(hass).async_get(entity_id) is not None
    )


def device_exists(hass: HomeAssistant, device_id: str | None) -> bool:
    """Check if device exists."""
    if not device_id:
        return False
    return dr.async_get(hass).async_get(device_id) is not None


def get_entity_name(hass: HomeAssistant, entity_id: str | None) -> str | None:
    """Get entity friendly name."""
    if not entity_id:
        return None
    ent_reg = er.async_get(hass)
    entry = ent_reg.async_get(entity_id)
    if entry and entry.name:
        return entry.name
    state = hass.states.get(entity_id)
    return state.name if state else entity_id


def get_device_name(hass: HomeAssistant, device_id: str | None) -> str | None:
    """Get device friendly name."""
    if not device_id:
        return None
    dev_reg = dr.async_get(hass)
    device = dev_reg.async_get(device_id)
    return device.name_by_user or device.name if device else None
