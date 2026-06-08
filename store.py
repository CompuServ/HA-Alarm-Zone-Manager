"""JSON Store persistence for Alarm Zone Manager."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    ACTION_DISABLED,
    DEFAULT_CODE_LENGTH,
    DEFAULT_CODE_TYPE,
    DEFAULT_DELAY_MS,
    DEFAULT_FIRE_TYPE,
    DEFAULT_INTRUSION_ENTRY_DELAY_1_SECONDS,
    DEFAULT_INTRUSION_ENTRY_DELAY_2_SECONDS,
    DEFAULT_INTRUSION_TYPE,
    DEFAULT_KEYPAD_TYPE,
    DEFAULT_USER_LEVEL,
    DOMAIN,
    KEYPAD_DISABLED,
    MAX_ALARM_ACCOUNT,
    MAX_ALARM_USER,
    MAX_KEYPAD,
    MAX_PARTITION,
    MAX_ZONE,
    MIN_ALARM_ACCOUNT,
    MIN_ALARM_USER,
    MIN_KEYPAD,
    MIN_PARTITION,
    MIN_ZONE,
    PARTITION_DISABLED,
    PROTOCOL_SIA,
    STORAGE_VERSION,
    ZONE_TEST_TOOL_DISABLED,
    ZONE_TYPE_AUTOMATION,
)


def _default_alarm_accounts() -> list[dict[str, Any]]:
    accounts = []
    for account_id in range(MIN_ALARM_ACCOUNT, MAX_ALARM_ACCOUNT + 1):
        accounts.append(
            {
                "account_id": account_id,
                "label": f"Alarm Account {account_id}",
                "enabled": False,
                "account_number": "0000",
                "protocol": PROTOCOL_SIA,
                "checkin_enabled": True,
                "checkin_interval": "24_hours",
                "receiver_ip": "0.0.0.0",
                "receiver_port": 3092,
            }
        )
    return accounts


def default_options() -> dict[str, Any]:
    """Default integration options."""
    return {
        "alarm_user_code_type": DEFAULT_CODE_TYPE,
        "alarm_user_code_length": DEFAULT_CODE_LENGTH,
        "default_delay_hours": 0,
        "default_delay_minutes": 0,
        "default_delay_seconds": 0,
        "default_delay_milliseconds": DEFAULT_DELAY_MS,
        "intrusion_entry_delay_1_seconds": DEFAULT_INTRUSION_ENTRY_DELAY_1_SECONDS,
        "intrusion_entry_delay_2_seconds": DEFAULT_INTRUSION_ENTRY_DELAY_2_SECONDS,
        "developer_options_enabled": False,
        "zone_test_tool": ZONE_TEST_TOOL_DISABLED,
        "repair_notifications": True,
        "alarm_accounts": _default_alarm_accounts(),
    }


def seed_zone(zone_id: int, options: dict[str, Any] | None = None) -> dict[str, Any]:
    """Create default zone record."""
    opts = options or default_options()
    return {
        "zone_id": zone_id,
        "zone_name": f"Zone {zone_id}",
        "zone_type": ZONE_TYPE_AUTOMATION,
        "intrusion_type": DEFAULT_INTRUSION_TYPE,
        "fire_type": DEFAULT_FIRE_TYPE,
        "partition": PARTITION_DISABLED,
        "action": ACTION_DISABLED,
        "previous_action": ACTION_DISABLED,
        "input_device_id": None,
        "input_entity_id": None,
        "output_device_id": None,
        "output_entity_id": None,
        "activate_entity_id": None,
        "delay_hours": opts["default_delay_hours"],
        "delay_minutes": opts["default_delay_minutes"],
        "delay_seconds": opts["default_delay_seconds"],
        "delay_milliseconds": opts["default_delay_milliseconds"],
        "pulse_hours": 0,
        "pulse_minutes": 0,
        "pulse_seconds": 30,
        "in_alarm": False,
        "disabled_reason": None,
    }


def seed_partition(partition_id: int) -> dict[str, Any]:
    """Create default partition record."""
    return {
        "partition_id": partition_id,
        "partition_name": "",
        "alarm_account": PARTITION_DISABLED,
        "activation_action": ACTION_DISABLED,
        "pulse_hours": 0,
        "pulse_minutes": 0,
        "pulse_seconds": 30,
        "activate_entity_id": None,
        "previous_activation_action": ACTION_DISABLED,
        "disabled_reason": None,
    }


def seed_keypad(keypad_id: int) -> dict[str, Any]:
    """Create default keypad record."""
    name = f"Keypad {keypad_id}"
    return {
        "keypad_id": keypad_id,
        "enabled": KEYPAD_DISABLED,
        "partition_ids": [],
        "keypad_type": DEFAULT_KEYPAD_TYPE,
        "keypad_name": name,
        "helper_entity_id": None,
        "helper_name": f"Intrusion Alarm Keypad: {name}",
    }


def seed_alarm_user(user_number: int) -> dict[str, Any]:
    """Create default alarm user record."""
    return {
        "user_number": user_number,
        "user_level": DEFAULT_USER_LEVEL,
        "partition_ids": list(range(MIN_PARTITION, MAX_PARTITION + 1)),
        "user_name": "",
        "user_code_hash": None,
        "has_code": False,
        "code_invalid_length": False,
        "code_invalid_format": False,
        "code_weak": False,
    }


class BaseStore:
    """Base store wrapper."""

    def __init__(self, hass: HomeAssistant, key: str) -> None:
        self._store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.{key}")
        self._data: dict[str, Any] | list[Any] | None = None

    async def async_load(self) -> Any:
        """Load data from store."""
        data = await self._store.async_load()
        self._data = data
        return data

    async def async_save(self) -> None:
        """Save data to store."""
        if self._data is not None:
            await self._store.async_save(self._data)

    @property
    def data(self) -> Any:
        """Return loaded data."""
        return self._data


class ZoneStore(BaseStore):
    """Zone persistence (1024 rows)."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, "zones")

    async def async_load(self) -> list[dict[str, Any]]:
        data = await super().async_load()
        if not data:
            options = default_options()
            self._data = [seed_zone(z, options) for z in range(MIN_ZONE, MAX_ZONE + 1)]
            await self.async_save()
        return self._data  # type: ignore[return-value]

    def get_zone(self, zone_id: int) -> dict[str, Any] | None:
        zones: list[dict[str, Any]] = self._data or []
        for zone in zones:
            if zone["zone_id"] == zone_id:
                return zone
        return None

    def update_zone(self, zone: dict[str, Any]) -> None:
        zones: list[dict[str, Any]] = self._data or []
        for idx, existing in enumerate(zones):
            if existing["zone_id"] == zone["zone_id"]:
                zones[idx] = zone
                return
        zones.append(zone)

    @property
    def zones(self) -> list[dict[str, Any]]:
        return list(self._data or [])


class PartitionStore(BaseStore):
    """Partition persistence (32 rows)."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, "partitions")

    async def async_load(self) -> list[dict[str, Any]]:
        data = await super().async_load()
        if not data:
            self._data = [
                seed_partition(p) for p in range(MIN_PARTITION, MAX_PARTITION + 1)
            ]
            await self.async_save()
        return self._data  # type: ignore[return-value]

    @property
    def partitions(self) -> list[dict[str, Any]]:
        return list(self._data or [])


class KeypadStore(BaseStore):
    """Keypad persistence (32 rows)."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, "keypads")

    async def async_load(self) -> list[dict[str, Any]]:
        data = await super().async_load()
        if not data:
            self._data = [seed_keypad(k) for k in range(MIN_KEYPAD, MAX_KEYPAD + 1)]
            await self.async_save()
        return self._data  # type: ignore[return-value]

    @property
    def keypads(self) -> list[dict[str, Any]]:
        return list(self._data or [])


class AlarmUserStore(BaseStore):
    """Alarm user persistence (128 rows)."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, "alarm_users")

    async def async_load(self) -> list[dict[str, Any]]:
        data = await super().async_load()
        if not data:
            self._data = [
                seed_alarm_user(u) for u in range(MIN_ALARM_USER, MAX_ALARM_USER + 1)
            ]
            await self.async_save()
        return self._data  # type: ignore[return-value]

    @property
    def users(self) -> list[dict[str, Any]]:
        return list(self._data or [])


class OptionsStore(BaseStore):
    """Options persistence."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, "options")

    async def async_load(self) -> dict[str, Any]:
        data = await super().async_load()
        if not data:
            self._data = default_options()
            await self.async_save()
        return self._data  # type: ignore[return-value]

    @property
    def options(self) -> dict[str, Any]:
        return dict(self._data or default_options())


class EventLogStore(BaseStore):
    """Event log persistence."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, "event_log")

    async def async_load(self) -> dict[str, Any]:
        data = await super().async_load()
        if not data:
            self._data = {"next_sequential_id": 1, "entries": []}
            await self.async_save()
        return self._data  # type: ignore[return-value]

    @property
    def entries(self) -> list[dict[str, Any]]:
        if not self._data:
            return []
        return list(self._data.get("entries", []))

    @property
    def next_sequential_id(self) -> int:
        if not self._data:
            return 1
        return int(self._data.get("next_sequential_id", 1))
