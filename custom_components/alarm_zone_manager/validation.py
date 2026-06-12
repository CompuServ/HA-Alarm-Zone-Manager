"""Validation helpers for Alarm Zone Manager."""

from __future__ import annotations

import re
from typing import Any

from .const import (
    ACTION_DISABLED,
    CODE_TYPE_NUMERIC,
    DEFAULT_DELAY_MS,
    INTRUSION_TYPE_ENTRY_DELAY_1,
    INTRUSION_TYPE_ENTRY_DELAY_2,
    MAX_CODE_LENGTH,
    MAX_INTRUSION_ENTRY_DELAY_SECONDS,
    MAX_PARTITION,
    MAX_ZONE_TEST_DURATION_MS,
    MIN_CODE_LENGTH,
    MIN_INTRUSION_ENTRY_DELAY_SECONDS,
    MIN_ZONE_TEST_DURATION_MS,
    PARTITION_DISABLED,
    PARTITION_NAME_MAX_LEN,
    USER_LEVEL_DISABLED,
    ZONE_NAME_MAX_LEN,
    ZONE_TEST_TOOL_ENABLED,
    ZONE_TYPE_AUTOMATION,
    ZONE_TYPE_FIRE,
    ZONE_TYPE_INTRUSION,
    delay_from_tuple,
    delay_tuple,
    normalize_partition,
)

ZONE_NAME_RE = re.compile(r"^[A-Za-z0-9 ]{1,32}$")
PARTITION_NAME_RE = re.compile(r"^[A-Za-z0-9]{0,16}$")


def display_zone_name(zone: dict[str, Any]) -> str:
    """Return zone display name."""
    return zone.get("zone_name") or f"Zone {zone.get('zone_id', '?')}"


def validate_zone_name(name: str) -> bool:
    """Validate zone name."""
    return bool(name and ZONE_NAME_RE.match(name) and len(name) <= ZONE_NAME_MAX_LEN)


def validate_partition_name(name: str) -> bool:
    """Validate partition name."""
    return PARTITION_NAME_RE.match(name or "") is not None


def validate_intrusion_entry_delay(seconds: int) -> bool:
    """Validate intrusion entry delay seconds."""
    return MIN_INTRUSION_ENTRY_DELAY_SECONDS <= int(seconds) <= MAX_INTRUSION_ENTRY_DELAY_SECONDS


def validate_zone_test_duration_ms(ms: int) -> bool:
    """Validate zone test duration."""
    return MIN_ZONE_TEST_DURATION_MS <= int(ms) <= MAX_ZONE_TEST_DURATION_MS


def is_zone_test_tool_enabled(options: dict[str, Any]) -> bool:
    """Check if zone test tool is enabled."""
    return bool(options.get("developer_options_enabled")) and (
        options.get("zone_test_tool") == ZONE_TEST_TOOL_ENABLED
    )


def get_intrusion_entry_delay_seconds(
    options: dict[str, Any], intrusion_type: str
) -> int | None:
    """Return entry delay seconds for intrusion type."""
    if intrusion_type == INTRUSION_TYPE_ENTRY_DELAY_1:
        return int(options.get("intrusion_entry_delay_1_seconds", 30))
    if intrusion_type == INTRUSION_TYPE_ENTRY_DELAY_2:
        return int(options.get("intrusion_entry_delay_2_seconds", 60))
    return None


def get_enabled_alarm_accounts(options: dict[str, Any]) -> list[dict[str, Any]]:
    """Return enabled alarm accounts."""
    return [a for a in options.get("alarm_accounts", []) if a.get("enabled")]


def sync_partition_alarm_accounts(
    options: dict[str, Any],
    partitions: list[dict[str, Any]],
    disabled_account_ids: list[int] | None = None,
) -> list[dict[str, Any]]:
    """Reset partitions tied to disabled alarm accounts."""
    disabled_ids = set(disabled_account_ids or [])
    for account in options.get("alarm_accounts", []):
        if not account.get("enabled"):
            disabled_ids.add(account["account_id"])

    result = []
    for partition in partitions:
        p = dict(partition)
        acct = str(p.get("alarm_account", PARTITION_DISABLED))
        if acct != PARTITION_DISABLED and acct.isdigit() and int(acct) in disabled_ids:
            p["alarm_account"] = PARTITION_DISABLED
        result.append(p)
    return result


def sync_default_debounce_to_zones(
    old_default: tuple[int, int, int, int],
    new_default: tuple[int, int, int, int],
    zones: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Update zones still on previous default debounce."""
    result = []
    for zone in zones:
        z = dict(zone)
        if delay_tuple(z) == old_default:
            z.update(delay_from_tuple(new_default))
        result.append(z)
    return result


def is_weak_user_code(code: str, code_type: str, length: int) -> bool:
    """Check if user code is weak."""
    if not code or len(code) != length:
        return False
    if len(set(code)) == 1:
        return True
    if code_type == CODE_TYPE_NUMERIC and code.isdigit():
        digits = [int(c) for c in code]
        ascending = all(
            digits[i + 1] == (digits[i] + 1) % 10 for i in range(len(digits) - 1)
        )
        descending = all(
            digits[i + 1] == (digits[i] - 1) % 10 for i in range(len(digits) - 1)
        )
        if ascending or descending:
            return True
    return False


def validate_user_code(
    code: str,
    options: dict[str, Any],
    user_level: str,
) -> dict[str, bool]:
    """Validate user code; return error flags."""
    flags = {
        "code_invalid_length": False,
        "code_invalid_format": False,
        "code_weak": False,
    }
    if user_level == USER_LEVEL_DISABLED or not code:
        return flags
    length = int(options.get("alarm_user_code_length", MIN_CODE_LENGTH))
    code_type = options.get("alarm_user_code_type", CODE_TYPE_NUMERIC)
    if len(code) != length:
        flags["code_invalid_length"] = True
    if code_type == CODE_TYPE_NUMERIC and not code.isdigit():
        flags["code_invalid_format"] = True
    if is_weak_user_code(code, code_type, length):
        flags["code_weak"] = True
    return flags


def normalize_zone(zone: dict[str, Any]) -> dict[str, Any]:
    """Normalize zone partition and editability metadata."""
    z = dict(zone)
    zone_type = z.get("zone_type", ZONE_TYPE_AUTOMATION)
    z["partition"] = normalize_partition(zone_type, z.get("partition"))
    z["partition_editable"] = zone_type in (ZONE_TYPE_INTRUSION, ZONE_TYPE_FIRE)
    z["intrusion_type_editable"] = zone_type == ZONE_TYPE_INTRUSION
    z["fire_type_editable"] = zone_type == ZONE_TYPE_FIRE
    z["output_action_editable"] = True
    z["output_action_display"] = z.get("action", ACTION_DISABLED)
    return z


def default_delay_tuple(options: dict[str, Any]) -> tuple[int, int, int, int]:
    """Default debounce tuple from options."""
    return (
        int(options.get("default_delay_hours", 0)),
        int(options.get("default_delay_minutes", 0)),
        int(options.get("default_delay_seconds", 0)),
        int(options.get("default_delay_milliseconds", DEFAULT_DELAY_MS)),
    )


def enrich_partitions(
    partitions: list[dict[str, Any]], options: dict[str, Any]
) -> list[dict[str, Any]]:
    """Add alarm account editability to partitions."""
    enabled = get_enabled_alarm_accounts(options)
    editable = len(enabled) > 0
    labels = {str(a["account_id"]): a["label"] for a in enabled}
    result = []
    for p in partitions:
        part = dict(p)
        part["alarm_account_editable"] = editable
        part["enabled_alarm_accounts"] = [
            {"id": str(a["account_id"]), "label": a["label"]} for a in enabled
        ]
        acct = str(part.get("alarm_account", PARTITION_DISABLED))
        if acct in labels:
            part["alarm_account_label"] = labels[acct]
        result.append(part)
    return result
