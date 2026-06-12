"""Alarm Zone Manager coordinator."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import Event, HomeAssistant, State, callback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .actions import ActionEngine, is_entity_active, resolve_action
from .const import (
    ACTION_DISABLED,
    ACTION_MIRROR,
    ACTION_PULSE,
    DOMAIN,
    EVENT_SOURCE_ZONE_TEST,
    INTRUSION_TYPE_ENTRY_DELAY_1,
    INTRUSION_TYPE_ENTRY_DELAY_2,
    PARTITION_STATE_ALARM,
    PARTITION_STATE_ARMED,
    PARTITION_STATE_DISARMED,
    PARTITION_STATE_ENTRY_DELAY,
    ZONE_TYPE_FIRE,
    ZONE_TYPE_INTRUSION,
)
from .debounce import DebounceManager
from .entity_helpers import entity_exists
from .event_log import EventLogManager
from .store import (
    AlarmUserStore,
    EventLogStore,
    KeypadStore,
    OptionsStore,
    PartitionStore,
    ZoneStore,
)
from .validation import display_zone_name, get_intrusion_entry_delay_seconds

_LOGGER = logging.getLogger(__name__)


class AlarmZoneCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Coordinate zone monitoring and actions."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, _LOGGER, name=DOMAIN)
        self.zone_store = ZoneStore(hass)
        self.partition_store = PartitionStore(hass)
        self.keypad_store = KeypadStore(hass)
        self.user_store = AlarmUserStore(hass)
        self.options_store = OptionsStore(hass)
        self.event_log_store = EventLogStore(hass)
        self.event_log = EventLogManager(self.event_log_store)
        self.debounce = DebounceManager(hass)
        self.actions = ActionEngine(hass)
        self._unsub: list[Any] = []
        self._partition_states: dict[int, str] = {}
        self._zone_alarm_state: dict[int, bool] = {}
        self._startup_complete = False

    async def async_setup(self) -> None:
        """Load stores and start listeners."""
        await self.zone_store.async_load()
        await self.partition_store.async_load()
        await self.keypad_store.async_load()
        await self.user_store.async_load()
        await self.options_store.async_load()
        await self.event_log_store.async_load()
        self.event_log.start_suppression()
        await self.event_log.log_restarted()
        for p in range(1, 33):
            self._partition_states[p] = PARTITION_STATE_DISARMED
        await self._setup_listeners()
        self._startup_complete = True
        await self.async_refresh()

    async def async_shutdown(self) -> None:
        """Shutdown coordinator."""
        self._clear_listeners()
        self.debounce.cancel_all()

    def _clear_listeners(self) -> None:
        """Remove all state change listeners."""
        for unsub in self._unsub:
            unsub()
        self._unsub.clear()

    async def async_refresh_listeners(self) -> None:
        """Rebuild input entity listeners after zone configuration changes."""
        self._clear_listeners()
        await self._setup_listeners()

    def get_partition(self, partition_id: int) -> dict[str, Any] | None:
        for p in self.partition_store.partitions:
            if p["partition_id"] == partition_id:
                return p
        return None

    async def _setup_listeners(self) -> None:
        for zone in self.zone_store.zones:
            entity_id = zone.get("input_entity_id")
            if not entity_id or not entity_exists(self.hass, entity_id):
                continue
            if zone.get("action") == ACTION_DISABLED and zone.get(
                "zone_type"
            ) not in (ZONE_TYPE_INTRUSION, ZONE_TYPE_FIRE):
                continue

            zone_id = zone["zone_id"]

            @callback
            def _on_change(
                event: Event,
                tracked_zone_id: int = zone_id,
            ) -> None:
                self.hass.async_create_task(
                    self._handle_state_change(tracked_zone_id)
                )

            self._unsub.append(
                async_track_state_change_event(
                    self.hass, [entity_id], _on_change
                )
            )
            _LOGGER.debug(
                "Listening to %s for zone %s (action=%s)",
                entity_id,
                zone_id,
                zone.get("action"),
            )

    async def _handle_state_change(self, zone_id: int, *, test: bool = False) -> None:
        zone = self.zone_store.get_zone(zone_id)
        if not zone:
            return
        entity_id = zone.get("input_entity_id")
        state = self.hass.states.get(entity_id) if entity_id else None
        active = is_entity_active(state)
        if active:
            await self._on_zone_active(zone, test=test)
        else:
            await self._on_zone_inactive(zone, test=test)

    async def _on_zone_active(self, zone: dict[str, Any], *, test: bool = False) -> None:
        zone_id = zone["zone_id"]

        async def _confirmed() -> None:
            await self._confirm_alarm(zone, test=test)

        self.debounce.start_zone_timer(zone_id, zone, _confirmed)

    async def _on_zone_inactive(
        self, zone: dict[str, Any], *, test: bool = False
    ) -> None:
        zone_id = zone["zone_id"]
        self.debounce.cancel_zone(zone_id)
        was_alarm = self._zone_alarm_state.get(zone_id, False)
        if was_alarm:
            zone["in_alarm"] = False
            self._zone_alarm_state[zone_id] = False
            self.zone_store.update_zone(zone)
            await self.zone_store.async_save()
            source = EVENT_SOURCE_ZONE_TEST if test else None
            await self.event_log.log_restoral(
                zone_id,
                display_zone_name(zone),
                **({"source": source} if source else {}),
            )
            partition = self._get_zone_partition(zone)
            action_cfg = resolve_action(zone, partition)
            if action_cfg.get("action") == ACTION_MIRROR:
                await self.actions.mirror_off(zone, action_cfg)
            elif action_cfg.get("action") == ACTION_PULSE:
                await self.actions.pulse_off(action_cfg)
        await self.async_refresh()

    async def _confirm_alarm(self, zone: dict[str, Any], *, test: bool = False) -> None:
        zone_id = zone["zone_id"]
        zone_type = zone.get("zone_type")
        partition_id = self._partition_id(zone)
        source_kw = {"source": EVENT_SOURCE_ZONE_TEST} if test else {}

        if (
            zone_type == ZONE_TYPE_INTRUSION
            and partition_id
            and self._partition_states.get(partition_id) == PARTITION_STATE_ARMED
            and zone.get("intrusion_type")
            in (INTRUSION_TYPE_ENTRY_DELAY_1, INTRUSION_TYPE_ENTRY_DELAY_2)
        ):
            delay = get_intrusion_entry_delay_seconds(
                self.options_store.options, zone["intrusion_type"]
            )
            if delay:

                async def _entry_expired() -> None:
                    self._partition_states[partition_id] = PARTITION_STATE_ALARM
                    await self._execute_zone_alarm(zone, test=test)

                self._partition_states[partition_id] = PARTITION_STATE_ENTRY_DELAY
                self.debounce.start_entry_delay_timer(
                    partition_id, float(delay), _entry_expired
                )
                await self.async_refresh()
                return

        await self._execute_zone_alarm(zone, test=test, **source_kw)

    async def _execute_zone_alarm(
        self, zone: dict[str, Any], *, test: bool = False, **source_kw: Any
    ) -> None:
        zone_id = zone["zone_id"]
        if self._zone_alarm_state.get(zone_id):
            return
        zone["in_alarm"] = True
        self._zone_alarm_state[zone_id] = True
        self.zone_store.update_zone(zone)
        await self.zone_store.async_save()
        await self.event_log.log_alarm(
            zone_id, display_zone_name(zone), **source_kw
        )
        partition = self._get_zone_partition(zone)
        action_cfg = resolve_action(zone, partition)
        _LOGGER.debug(
            "Zone %s alarm confirmed; action=%s output=%s",
            zone_id,
            action_cfg.get("action"),
            action_cfg.get("output_entity_id"),
        )
        await self.actions.execute(zone, action_cfg)
        pid = self._partition_id(zone)
        if pid:
            self._partition_states[pid] = PARTITION_STATE_ALARM
        self.hass.bus.async_fire(
            f"{DOMAIN}.zone_state_changed",
            {
                "zone_id": zone_id,
                "zone_name": display_zone_name(zone),
                "event": "alarm",
            },
        )
        await self.async_refresh()

    def _partition_id(self, zone: dict[str, Any]) -> int | None:
        part = zone.get("partition")
        if part in (None, "disabled", ""):
            return None
        try:
            return int(part)
        except (TypeError, ValueError):
            return None

    def _get_zone_partition(self, zone: dict[str, Any]) -> dict[str, Any] | None:
        pid = self._partition_id(zone)
        return self.get_partition(pid) if pid else None

    async def test_zone_activate(self, zone_id: int, duration_ms: int) -> None:
        """Simulate zone active for duration."""
        zone = self.zone_store.get_zone(zone_id)
        if not zone:
            return
        await self._on_zone_active(zone, test=True)

        async def _restoral() -> None:
            await self._on_zone_inactive(zone, test=True)

        self.hass.loop.call_later(
            max(duration_ms / 1000.0, 0.1),
            lambda: self.hass.async_create_task(_restoral()),
        )

    def get_keypad_state(self, keypad: dict[str, Any]) -> dict[str, Any]:
        """Build keypad helper attributes."""
        part_ids = set(keypad.get("partition_ids", []))
        keypad_type = keypad.get("keypad_type")
        options = self.options_store.options

        if keypad_type == ZONE_TYPE_FIRE:
            fire_zones = [
                z
                for z in self.zone_store.zones
                if z.get("zone_type") == ZONE_TYPE_FIRE
                and self._partition_id(z) in part_ids
                and z.get("in_alarm")
            ]
            in_alarm = len(fire_zones) > 0
            line1 = "FIRE SYSTEM ALARM" if in_alarm else "FIRE SYSTEM NORMAL"
            return {
                "keypad_type": ZONE_TYPE_FIRE,
                "status_line1": line1.ljust(40)[:40],
                "status_line2": "",
                "system_active": not in_alarm,
                "fire_alarm": in_alarm,
            }

        intrusion_zones = [
            z
            for z in self.zone_store.zones
            if z.get("zone_type") == ZONE_TYPE_INTRUSION
            and self._partition_id(z) in part_ids
            and z.get("in_alarm")
        ]
        ready = len(intrusion_zones) == 0
        line1 = ("READY TO ARM" if ready else "NOT READY TO ARM").ljust(40)[:40]
        return {
            "keypad_type": ZONE_TYPE_INTRUSION,
            "ready_to_arm": ready,
            "status_line1": line1,
            "zones_in_alarm": [
                {"zone_id": z["zone_id"], "zone_name": display_zone_name(z)}
                for z in intrusion_zones
            ],
            "code_type": options.get("alarm_user_code_type", "numeric"),
            "code_length": options.get("alarm_user_code_length", 4),
        }

    async def _async_update_data(self) -> dict[str, Any]:
        return {
            "zones": self.zone_store.zones,
            "partitions": self.partition_store.partitions,
            "keypads": self.keypad_store.keypads,
            "users": self.user_store.users,
            "options": self.options_store.options,
        }
