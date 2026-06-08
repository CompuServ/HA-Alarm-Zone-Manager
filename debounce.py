"""Debounce timer management."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from homeassistant.core import HomeAssistant

from .const import delay_to_timedelta


class DebounceManager:
    """Manage per-zone debounce timers."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._timers: dict[int, asyncio.TimerHandle] = {}
        self._entry_timers: dict[int, asyncio.TimerHandle] = {}

    def cancel_zone(self, zone_id: int) -> None:
        """Cancel zone debounce timer."""
        handle = self._timers.pop(zone_id, None)
        if handle:
            handle.cancel()

    def cancel_entry_delay(self, partition_id: int) -> None:
        """Cancel partition entry delay timer."""
        handle = self._entry_timers.pop(partition_id, None)
        if handle:
            handle.cancel()

    def cancel_all(self) -> None:
        """Cancel all timers."""
        for zone_id in list(self._timers):
            self.cancel_zone(zone_id)
        for part_id in list(self._entry_timers):
            self.cancel_entry_delay(part_id)

    def start_zone_timer(
        self,
        zone_id: int,
        zone: dict[str, Any],
        callback: Callable[[], Awaitable[None]],
    ) -> None:
        """Start debounce timer for zone."""
        self.cancel_zone(zone_id)
        delay = delay_to_timedelta(
            zone.get("delay_hours", 0),
            zone.get("delay_minutes", 0),
            zone.get("delay_seconds", 0),
            zone.get("delay_milliseconds", 250),
        )
        seconds = max(delay.total_seconds(), 0.001)

        async def _fire() -> None:
            self._timers.pop(zone_id, None)
            await callback()

        self._timers[zone_id] = self._hass.loop.call_later(
            seconds,
            lambda: self._hass.async_create_task(_fire()),
        )

    def start_entry_delay_timer(
        self,
        partition_id: int,
        seconds: float,
        callback: Callable[[], Awaitable[None]],
    ) -> None:
        """Start entry delay timer for partition."""
        self.cancel_entry_delay(partition_id)

        async def _fire() -> None:
            self._entry_timers.pop(partition_id, None)
            await callback()

        self._entry_timers[partition_id] = self._hass.loop.call_later(
            max(seconds, 0.001),
            lambda: self._hass.async_create_task(_fire()),
        )
