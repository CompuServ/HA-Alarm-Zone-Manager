"""Alarm Zone Manager integration."""

from __future__ import annotations

import logging

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import (
    ATTR_EVENT,
    ATTR_ZONE_ID,
    ATTR_ZONE_NAME,
    DOMAIN,
    SERVICE_FIRE_ZONE_EVENT,
    SERVICE_TEST_ZONE_ACTIVATE,
    SERVICE_TRIGGER_ZONE,
)
from .coordinator import AlarmZoneCoordinator
from .keypad import KeypadManager
from .panel import async_register_panel
from .websocket_api import async_register_websocket_handlers

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.BINARY_SENSOR, Platform.SENSOR]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up integration."""
    async_register_panel(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up from config entry."""
    coordinator = AlarmZoneCoordinator(hass)
    await coordinator.async_setup()
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["coordinator"] = coordinator
    hass.data[DOMAIN]["entry"] = entry

    keypad_manager = KeypadManager(hass, coordinator)
    hass.data[DOMAIN]["keypad_manager"] = keypad_manager
    await keypad_manager.async_setup()

    async_register_websocket_handlers(hass)

    hass.http.register_static_path(
        "/alarm_zone_manager/keypad-card.js",
        str(
            __import__("pathlib").Path(__file__).parent
            / "frontend"
            / "lovelace"
            / "alarm-keypad-card.js"
        ),
        cache_headers=False,
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    async def handle_trigger(call):
        zone_id = call.data[ATTR_ZONE_ID]
        zone = coordinator.zone_store.get_zone(zone_id)
        if zone:
            partition = coordinator.get_partition(int(zone.get("partition", 0) or 0))
            from .actions import resolve_action

            action_cfg = resolve_action(zone, partition)
            await coordinator.actions.execute(zone, action_cfg)

    async def handle_test(call):
        await coordinator.test_zone_activate(
            call.data[ATTR_ZONE_ID], call.data.get("duration_ms", 5000)
        )

    async def handle_fire_event(call):
        hass.bus.async_fire(
            f"{DOMAIN}.zone_state_changed",
            {
                ATTR_ZONE_ID: call.data[ATTR_ZONE_ID],
                ATTR_ZONE_NAME: call.data.get(ATTR_ZONE_NAME, ""),
                ATTR_EVENT: call.data.get(ATTR_EVENT, "alarm"),
            },
        )

    hass.services.async_register(
        DOMAIN,
        SERVICE_TRIGGER_ZONE,
        handle_trigger,
        schema=vol.Schema({vol.Required(ATTR_ZONE_ID): vol.Coerce(int)}),
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_TEST_ZONE_ACTIVATE,
        handle_test,
        schema=vol.Schema(
            {
                vol.Required(ATTR_ZONE_ID): vol.Coerce(int),
                vol.Required("duration_ms"): vol.All(
                    vol.Coerce(int), vol.Range(min=100, max=300000)
                ),
            }
        ),
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_FIRE_ZONE_EVENT,
        handle_fire_event,
        schema=vol.Schema(
            {
                vol.Required(ATTR_ZONE_ID): vol.Coerce(int),
                vol.Optional(ATTR_ZONE_NAME): str,
                vol.Optional(ATTR_EVENT): str,
            }
        ),
    )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload config entry."""
    coordinator: AlarmZoneCoordinator = hass.data[DOMAIN]["coordinator"]
    await coordinator.async_shutdown()
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    hass.data.pop(DOMAIN, None)
    return unload_ok
