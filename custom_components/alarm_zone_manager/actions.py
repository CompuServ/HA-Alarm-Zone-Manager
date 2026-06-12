"""Action resolution and execution."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from homeassistant.core import HomeAssistant, State

from .const import (
    ACTION_ACTIVATE,
    ACTION_DISABLED,
    ACTION_MIRROR,
    ACTION_PULSE,
    ZONE_TYPE_AUTOMATION,
    delay_to_timedelta,
)

_LOGGER = logging.getLogger(__name__)

_TURN_ON_DOMAINS = frozenset(
    {
        "light",
        "switch",
        "input_boolean",
        "input_switch",
        "siren",
        "fan",
        "valve",
        "cover",
        "lock",
        "media_player",
        "humidifier",
        "water_heater",
    }
)


def resolve_action(
    zone: dict[str, Any], partition: dict[str, Any] | None
) -> dict[str, Any]:
    """Resolve action config for zone."""
    zone_type = zone.get("zone_type", ZONE_TYPE_AUTOMATION)
    if zone_type == ZONE_TYPE_AUTOMATION:
        return {
            "action": zone.get("action", ACTION_DISABLED),
            "output_entity_id": zone.get("output_entity_id"),
            "activate_entity_id": zone.get("activate_entity_id"),
            "pulse_hours": zone.get("pulse_hours", 0),
            "pulse_minutes": zone.get("pulse_minutes", 0),
            "pulse_seconds": zone.get("pulse_seconds", 30),
        }
    return {
        "action": zone.get("action", ACTION_DISABLED),
        "output_entity_id": zone.get("output_entity_id"),
        "activate_entity_id": zone.get("activate_entity_id"),
        "pulse_hours": zone.get("pulse_hours", 0),
        "pulse_minutes": zone.get("pulse_minutes", 0),
        "pulse_seconds": zone.get("pulse_seconds", 30),
    }


class ActionEngine:
    """Execute zone actions."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._pulse_handles: dict[str, asyncio.TimerHandle] = {}

    async def execute(self, zone: dict[str, Any], action_cfg: dict[str, Any]) -> None:
        """Execute resolved action."""
        action = action_cfg.get("action", ACTION_DISABLED)
        output = action_cfg.get("output_entity_id")
        zone_id = zone.get("zone_id")
        if action == ACTION_DISABLED:
            _LOGGER.debug("Zone %s action disabled; skipping output", zone_id)
            return
        if action in (ACTION_MIRROR, ACTION_PULSE) and not output:
            _LOGGER.warning(
                "Zone %s action %s requires output_entity_id", zone_id, action
            )
            return
        if action == ACTION_MIRROR:
            _LOGGER.info("Zone %s mirror ON -> %s", zone_id, output)
            await self._set_output(output, True)
        elif action == ACTION_PULSE:
            _LOGGER.info("Zone %s pulse ON -> %s", zone_id, output)
            await self._set_output(output, True)
            delay = delay_to_timedelta(
                action_cfg.get("pulse_hours", 0),
                action_cfg.get("pulse_minutes", 0),
                action_cfg.get("pulse_seconds", 30),
            )
            self._schedule_pulse_off(output, delay.total_seconds())
        elif action == ACTION_ACTIVATE:
            target = action_cfg.get("activate_entity_id")
            if target:
                _LOGGER.info("Zone %s activate -> %s", zone_id, target)
                await self._activate(target)
            else:
                _LOGGER.warning(
                    "Zone %s activate action missing activate_entity_id", zone_id
                )

    async def mirror_off(self, zone: dict[str, Any], action_cfg: dict[str, Any]) -> None:
        """Turn mirror output off immediately."""
        if action_cfg.get("action") != ACTION_MIRROR:
            return
        output = action_cfg.get("output_entity_id")
        if output:
            _LOGGER.info("Zone %s mirror OFF -> %s", zone.get("zone_id"), output)
            await self._set_output(output, False)

    async def pulse_off(self, action_cfg: dict[str, Any]) -> None:
        """Cancel pulse timer and turn output off."""
        if action_cfg.get("action") != ACTION_PULSE:
            return
        output = action_cfg.get("output_entity_id")
        if not output:
            return
        handle = self._pulse_handles.pop(output, None)
        if handle:
            handle.cancel()
        _LOGGER.info("Zone pulse OFF -> %s", output)
        await self._set_output(output, False)

    async def _set_output(self, entity_id: str, on: bool) -> None:
        domain = entity_id.split(".", 1)[0]
        service = "turn_on" if on else "turn_off"
        if domain in _TURN_ON_DOMAINS:
            await self._hass.services.async_call(
                domain, service, {"entity_id": entity_id}, blocking=True
            )
            return
        await self._hass.services.async_call(
            "homeassistant", service, {"entity_id": entity_id}, blocking=True
        )

    def _schedule_pulse_off(self, entity_id: str, seconds: float) -> None:
        if entity_id in self._pulse_handles:
            self._pulse_handles[entity_id].cancel()

        async def _off() -> None:
            self._pulse_handles.pop(entity_id, None)
            await self._set_output(entity_id, False)

        self._pulse_handles[entity_id] = self._hass.loop.call_later(
            max(seconds, 0.001),
            lambda: self._hass.async_create_task(_off()),
        )

    async def _activate(self, entity_id: str) -> None:
        domain = entity_id.split(".", 1)[0]
        if domain == "automation":
            await self._hass.services.async_call(
                "automation", "trigger", {"entity_id": entity_id}, blocking=True
            )
        elif domain == "script":
            await self._hass.services.async_call(
                "script", entity_id.split(".", 1)[1], {}, blocking=True
            )
        elif domain == "scene":
            await self._hass.services.async_call(
                "scene", "turn_on", {"entity_id": entity_id}, blocking=True
            )


def is_entity_active(state: State | None) -> bool:
    """Return True if entity state represents active/on."""
    if state is None:
        return False
    return state.state in ("on", "open", "detected", "active", "triggered", "1")
