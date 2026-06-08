"""WebSocket API for Alarm Zone Manager panel."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import Unauthorized

from .const import DOMAIN
from .coordinator import AlarmZoneCoordinator
from .sort import sort_alarm_users, sort_event_log, sort_partitions, sort_zones
from .user_auth import (
    apply_user_code,
    generate_random_user_code,
    user_has_partition_access,
    verify_user_code_hash,
)
from .validation import (
    default_delay_tuple,
    enrich_partitions,
    is_zone_test_tool_enabled,
    normalize_zone,
    sync_default_debounce_to_zones,
    sync_partition_alarm_accounts,
    validate_intrusion_entry_delay,
    validate_partition_name,
    validate_user_code,
    validate_zone_name,
    validate_zone_test_duration_ms,
)

_LOGGER = logging.getLogger(__name__)


def _get_coordinator(hass: HomeAssistant) -> AlarmZoneCoordinator:
    return hass.data[DOMAIN]["coordinator"]


def _require_admin(hass: HomeAssistant) -> None:
    if not hass.auth.async_current_user():
        raise Unauthorized
    user = hass.auth.async_current_user()
    if not user.is_admin:
        raise Unauthorized


@callback
def async_register_websocket_handlers(hass: HomeAssistant) -> None:
    """Register websocket commands."""

    @websocket_api.websocket_command({vol.Required("type"): "alarm_zone_manager/list_zones"})
    @websocket_api.async_response
    async def ws_list_zones(hass, connection, msg):
        coord = _get_coordinator(hass)
        column = msg.get("sort_column", "zone_id")
        direction = msg.get("sort_direction", "asc")
        zones = [normalize_zone(z) for z in sort_zones(coord.zone_store.zones, column, direction)]
        options = coord.options_store.options
        connection.send_result(
            msg["id"],
            {
                "zones": zones,
                "zone_test_tool_enabled": is_zone_test_tool_enabled(options),
            },
        )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "alarm_zone_manager/update_zone",
            vol.Required("zone"): dict,
        }
    )
    @websocket_api.async_response
    async def ws_update_zone(hass, connection, msg):
        coord = _get_coordinator(hass)
        zone = dict(msg["zone"])
        if not validate_zone_name(zone.get("zone_name", "")):
            connection.send_error(msg["id"], "invalid_zone_name", "Invalid zone name")
            return
        zone = normalize_zone(zone)
        coord.zone_store.update_zone(zone)
        await coord.zone_store.async_save()
        await coord.async_refresh()
        connection.send_result(msg["id"], {"success": True, "zone": zone})

    @websocket_api.websocket_command(
        {vol.Required("type"): "alarm_zone_manager/list_partitions"}
    )
    @websocket_api.async_response
    async def ws_list_partitions(hass, connection, msg):
        coord = _get_coordinator(hass)
        column = msg.get("sort_column", "partition_id")
        direction = msg.get("sort_direction", "asc")
        parts = enrich_partitions(coord.partition_store.partitions, coord.options_store.options)
        parts = sort_partitions(parts, column, direction)
        connection.send_result(msg["id"], {"partitions": parts})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "alarm_zone_manager/update_partition",
            vol.Required("partition"): dict,
        }
    )
    @websocket_api.async_response
    async def ws_update_partition(hass, connection, msg):
        coord = _get_coordinator(hass)
        part = dict(msg["partition"])
        if not validate_partition_name(part.get("partition_name", "")):
            connection.send_error(msg["id"], "invalid_name", "Invalid partition name")
            return
        parts = coord.partition_store.partitions
        for i, p in enumerate(parts):
            if p["partition_id"] == part["partition_id"]:
                parts[i] = part
                break
        coord.partition_store._data = parts
        await coord.partition_store.async_save()
        await coord.async_refresh()
        connection.send_result(msg["id"], {"success": True})

    @websocket_api.websocket_command({vol.Required("type"): "alarm_zone_manager/list_keypads"})
    @websocket_api.async_response
    async def ws_list_keypads(hass, connection, msg):
        coord = _get_coordinator(hass)
        connection.send_result(msg["id"], {"keypads": coord.keypad_store.keypads})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "alarm_zone_manager/update_keypad",
            vol.Required("keypad"): dict,
        }
    )
    @websocket_api.async_response
    async def ws_update_keypad(hass, connection, msg):
        coord = _get_coordinator(hass)
        keypad = dict(msg["keypad"])
        keypads = coord.keypad_store.keypads
        for i, k in enumerate(keypads):
            if k["keypad_id"] == keypad["keypad_id"]:
                keypads[i] = keypad
                break
        coord.keypad_store._data = keypads
        await coord.keypad_store.async_save()
        hass.async_create_task(hass.data[DOMAIN]["keypad_manager"].sync_keypads())
        connection.send_result(msg["id"], {"success": True})

    @websocket_api.websocket_command(
        {vol.Required("type"): "alarm_zone_manager/list_alarm_users"}
    )
    @websocket_api.async_response
    async def ws_list_users(hass, connection, msg):
        coord = _get_coordinator(hass)
        column = msg.get("sort_column", "user_number")
        direction = msg.get("sort_direction", "asc")
        users = sort_alarm_users(coord.user_store.users, column, direction)
        connection.send_result(msg["id"], {"users": users})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "alarm_zone_manager/update_alarm_user",
            vol.Required("user"): dict,
            vol.Optional("user_code"): str,
        }
    )
    @websocket_api.async_response
    async def ws_update_user(hass, connection, msg):
        coord = _get_coordinator(hass)
        user = apply_user_code(dict(msg["user"]), msg.get("user_code"), coord.options_store.options)
        flags = validate_user_code(
            msg.get("user_code", ""),
            coord.options_store.options,
            user.get("user_level", "disabled"),
        ) if msg.get("user_code") else {}
        if any(flags.values()):
            connection.send_error(msg["id"], "invalid_code", "Invalid user code")
            return
        users = coord.user_store.users
        for i, u in enumerate(users):
            if u["user_number"] == user["user_number"]:
                users[i] = user
                break
        coord.user_store._data = users
        await coord.user_store.async_save()
        connection.send_result(msg["id"], {"success": True})

    @websocket_api.websocket_command({vol.Required("type"): "alarm_zone_manager/get_options"})
    @websocket_api.async_response
    async def ws_get_options(hass, connection, msg):
        coord = _get_coordinator(hass)
        opts = coord.options_store.options
        connection.send_result(
            msg["id"],
            {
                **opts,
                "zone_test_tool_enabled": is_zone_test_tool_enabled(opts),
            },
        )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "alarm_zone_manager/update_options",
            vol.Required("options"): dict,
        }
    )
    @websocket_api.async_response
    async def ws_update_options(hass, connection, msg):
        coord = _get_coordinator(hass)
        old = coord.options_store.options
        new = dict(msg["options"])
        if not validate_intrusion_entry_delay(
            new.get("intrusion_entry_delay_1_seconds", 30)
        ) or not validate_intrusion_entry_delay(
            new.get("intrusion_entry_delay_2_seconds", 60)
        ):
            connection.send_error(msg["id"], "invalid_delay", "Invalid entry delay")
            return
        old_default = default_delay_tuple(old)
        new_default = default_delay_tuple(new)
        if old_default != new_default and msg.get("apply_default_debounce"):
            zones = sync_default_debounce_to_zones(
                old_default, new_default, coord.zone_store.zones
            )
            coord.zone_store._data = zones
            await coord.zone_store.async_save()
        parts = sync_partition_alarm_accounts(new, coord.partition_store.partitions)
        coord.partition_store._data = parts
        coord.options_store._data = new
        await coord.partition_store.async_save()
        await coord.options_store.async_save()
        await coord.async_refresh()
        connection.send_result(msg["id"], {"success": True, "user_code_review_required": False})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "alarm_zone_manager/generate_user_code",
            vol.Optional("exclude_user_number"): int,
        }
    )
    @websocket_api.async_response
    async def ws_generate_code(hass, connection, msg):
        coord = _get_coordinator(hass)
        hashes = [u.get("user_code_hash") for u in coord.user_store.users]
        code = generate_random_user_code(
            coord.options_store.options,
            hashes,
            msg.get("exclude_user_number"),
        )
        connection.send_result(msg["id"], {"code": code})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "alarm_zone_manager/verify_user_code",
            vol.Required("code"): str,
            vol.Required("partition_ids"): [int],
            vol.Optional("intent"): str,
        }
    )
    @websocket_api.async_response
    async def ws_verify_code(hass, connection, msg):
        coord = _get_coordinator(hass)
        code = msg["code"]
        part_ids = msg["partition_ids"]
        for user in coord.user_store.users:
            if user.get("user_level") == "disabled":
                continue
            if not verify_user_code_hash(code, user.get("user_code_hash")):
                continue
            if not all(user_has_partition_access(user, p) for p in part_ids):
                continue
            if msg.get("intent") == "disarm":
                for pid in part_ids:
                    coord._partition_states[pid] = "disarmed"
                    coord.debounce.cancel_entry_delay(pid)
            connection.send_result(msg["id"], {"success": True, "user_number": user["user_number"]})
            await coord.async_refresh()
            return
        connection.send_result(msg["id"], {"success": False})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "alarm_zone_manager/test_zone_activate",
            vol.Required("zone_id"): int,
            vol.Required("duration_ms"): int,
        }
    )
    @websocket_api.async_response
    async def ws_test_zone(hass, connection, msg):
        _require_admin(hass)
        coord = _get_coordinator(hass)
        if not is_zone_test_tool_enabled(coord.options_store.options):
            connection.send_error(msg["id"], "disabled", "Zone test tool disabled")
            return
        if not validate_zone_test_duration_ms(msg["duration_ms"]):
            connection.send_error(msg["id"], "invalid_duration", "Invalid duration")
            return
        await coord.test_zone_activate(msg["zone_id"], msg["duration_ms"])
        connection.send_result(msg["id"], {"success": True})

    @websocket_api.websocket_command({vol.Required("type"): "alarm_zone_manager/list_event_log"})
    @websocket_api.async_response
    async def ws_list_log(hass, connection, msg):
        coord = _get_coordinator(hass)
        column = msg.get("sort_column", "sequential_id")
        direction = msg.get("sort_direction", "desc")
        entries = [
            coord.event_log.format_entry_for_ui(e)
            for e in sort_event_log(coord.event_log_store.entries, column, direction)
        ]
        connection.send_result(msg["id"], {"entries": entries})

    @websocket_api.websocket_command({vol.Required("type"): "alarm_zone_manager/reset_event_log"})
    @websocket_api.async_response
    async def ws_reset_log(hass, connection, msg):
        _require_admin(hass)
        coord = _get_coordinator(hass)
        await coord.event_log.reset()
        connection.send_result(msg["id"], {"success": True})

    @websocket_api.websocket_command({vol.Required("type"): "alarm_zone_manager/export_event_log"})
    @websocket_api.async_response
    async def ws_export_log(hass, connection, msg):
        _require_admin(hass)
        coord = _get_coordinator(hass)
        filename, content = await coord.event_log.export_csv()
        connection.send_result(
            msg["id"], {"filename": filename, "content": content}
        )

    @websocket_api.websocket_command({vol.Required("type"): "alarm_zone_manager/list_entities"})
    @websocket_api.async_response
    async def ws_list_entities(hass, connection, msg):
        domain = msg.get("domain")
        entities = []
        for state in hass.states.async_all(domain):
            entities.append(
                {"entity_id": state.entity_id, "name": state.name or state.entity_id}
            )
        entities.sort(key=lambda e: e["name"].lower())
        connection.send_result(msg["id"], {"entities": entities})

    for handler in (
        ws_list_zones,
        ws_update_zone,
        ws_list_partitions,
        ws_update_partition,
        ws_list_keypads,
        ws_update_keypad,
        ws_list_users,
        ws_update_user,
        ws_get_options,
        ws_update_options,
        ws_generate_code,
        ws_verify_code,
        ws_test_zone,
        ws_list_log,
        ws_reset_log,
        ws_export_log,
        ws_list_entities,
    ):
        websocket_api.async_register_command(hass, handler)
