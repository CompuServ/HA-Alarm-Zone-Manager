"""Sort helpers for spreadsheet grids."""

from __future__ import annotations

from typing import Any, Callable

from .const import (
    ACTION_DISABLED,
    PARTITION_DISABLED,
    ZONE_TYPE_AUTOMATION,
    ZONE_TYPE_FIRE,
    ZONE_TYPE_INTRUSION,
)


def _zone_configured(column: str, zone: dict[str, Any]) -> bool:
    if column == "zone_name":
        return bool(zone.get("zone_name"))
    if column == "input":
        return bool(zone.get("input_device_id") and zone.get("input_entity_id"))
    if column == "output":
        return bool(zone.get("output_device_id") and zone.get("output_entity_id"))
    if column == "output_action":
        return (
            zone.get("zone_type") == ZONE_TYPE_AUTOMATION
            and zone.get("action") != ACTION_DISABLED
        )
    if column == "partition":
        return zone.get("zone_type") in (ZONE_TYPE_INTRUSION, ZONE_TYPE_FIRE) and (
            str(zone.get("partition")) not in (PARTITION_DISABLED, "disabled", None, "")
        )
    if column == "intrusion_type":
        return zone.get("zone_type") == ZONE_TYPE_INTRUSION
    if column == "fire_type":
        return zone.get("zone_type") == ZONE_TYPE_FIRE
    return True


def _zone_sort_key(column: str, zone: dict[str, Any]) -> Any:
    if column == "zone_id":
        return zone["zone_id"]
    if column == "zone_name":
        return zone.get("zone_name", "").lower()
    if column == "zone_type":
        return zone.get("zone_type", "")
    if column == "intrusion_type":
        return zone.get("intrusion_type", "")
    if column == "fire_type":
        return zone.get("fire_type", "")
    if column == "debounce":
        return (
            zone.get("delay_hours", 0) * 3600000
            + zone.get("delay_minutes", 0) * 60000
            + zone.get("delay_seconds", 0) * 1000
            + zone.get("delay_milliseconds", 0)
        )
    if column == "output_action":
        return zone.get("action", ACTION_DISABLED)
    if column == "partition":
        p = zone.get("partition", PARTITION_DISABLED)
        if p in (PARTITION_DISABLED, "disabled", None, ""):
            return 999
        return int(p)
    return zone.get(column, "")


def sort_rows(
    rows: list[dict[str, Any]],
    column: str,
    direction: str,
    configured_fn: Callable[[str, dict[str, Any]], bool],
    sort_key_fn: Callable[[str, dict[str, Any]], Any],
    id_key: str = "zone_id",
) -> list[dict[str, Any]]:
    """Sort rows configured-first then unconfigured."""
    reverse = direction == "desc"
    configured = [r for r in rows if configured_fn(column, r)]
    unconfigured = [r for r in rows if not configured_fn(column, r)]
    configured.sort(key=lambda r: sort_key_fn(column, r), reverse=reverse)
    unconfigured.sort(key=lambda r: r[id_key])
    return configured + unconfigured


def sort_zones(
    zones: list[dict[str, Any]], column: str, direction: str = "asc"
) -> list[dict[str, Any]]:
    """Sort zone list."""
    return sort_rows(zones, column, direction, _zone_configured, _zone_sort_key)


def sort_partitions(
    partitions: list[dict[str, Any]], column: str, direction: str = "asc"
) -> list[dict[str, Any]]:
    """Sort partitions."""
    reverse = direction == "desc"

    def key(p: dict[str, Any]) -> Any:
        if column == "partition_name":
            return p.get("partition_name", "").lower()
        if column == "alarm_account":
            return p.get("alarm_account", PARTITION_DISABLED)
        if column == "activation_action":
            return p.get("activation_action", ACTION_DISABLED)
        return p.get("partition_id", 0)

    return sorted(partitions, key=key, reverse=reverse)


def sort_alarm_users(
    users: list[dict[str, Any]], column: str, direction: str = "asc"
) -> list[dict[str, Any]]:
    """Sort alarm users."""
    reverse = direction == "desc"

    def key(u: dict[str, Any]) -> Any:
        if column == "user_name":
            return u.get("user_name", "").lower()
        if column == "user_level":
            return u.get("user_level", "")
        if column == "user_code":
            return u.get("has_code", False)
        return u.get("user_number", 0)

    return sorted(users, key=key, reverse=reverse)


def sort_event_log(
    entries: list[dict[str, Any]], column: str = "sequential_id", direction: str = "desc"
) -> list[dict[str, Any]]:
    """Sort event log entries."""
    reverse = direction == "desc"

    def key(e: dict[str, Any]) -> Any:
        if column == "sequential_id":
            return e.get("sequential_id", 0)
        if column == "date" or column == "time":
            return e.get("timestamp", "")
        if column == "event_type":
            return e.get("event_type", "")
        if column == "zone_id":
            return e.get("zone_id") or 0
        if column == "zone_name":
            return (e.get("zone_name") or "").lower()
        return e.get("sequential_id", 0)

    return sorted(entries, key=key, reverse=reverse)
