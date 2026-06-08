"""Constants for Alarm Zone Manager."""

from __future__ import annotations

from datetime import timedelta

DOMAIN = "alarm_zone_manager"
STORAGE_VERSION = 1

MIN_ZONE = 1
MAX_ZONE = 1024
ZONE_NAME_MAX_LEN = 32

ACTION_DISABLED = "disabled"
ACTION_MIRROR = "mirror"
ACTION_PULSE = "pulse"
ACTION_ACTIVATE = "activate"

DEFAULT_DELAY_MS = 250

MIN_INTRUSION_ENTRY_DELAY_SECONDS = 10
MAX_INTRUSION_ENTRY_DELAY_SECONDS = 300
DEFAULT_INTRUSION_ENTRY_DELAY_1_SECONDS = 30
DEFAULT_INTRUSION_ENTRY_DELAY_2_SECONDS = 60

DEV_OPTIONS_ENABLED = "enabled"
DEV_OPTIONS_DISABLED = "disabled"
ZONE_TEST_TOOL_ENABLED = "enabled"
ZONE_TEST_TOOL_DISABLED = "disabled"
DEFAULT_ZONE_TEST_DURATION_SECONDS = 5
MIN_ZONE_TEST_DURATION_MS = 100
MAX_ZONE_TEST_DURATION_MS = 300_000

EVENT_TYPE_ALARM = "alarm"
EVENT_TYPE_RESTORAL = "restoral"
EVENT_TYPE_RESTARTED = "restarted"
EVENT_TYPE_LOG_RESET = "log_reset"
EVENT_TYPE_LOG_EXPORTED = "log_exported"
EVENT_LOG_STARTUP_SUPPRESS_SECONDS = 30

EVENT_SOURCE_ZONE_INPUT = "zone_input"
EVENT_SOURCE_ZONE_TEST = "zone_test_tool"
EVENT_SOURCE_SYSTEM = "system"

ZONE_TYPE_AUTOMATION = "automation"
ZONE_TYPE_INTRUSION = "intrusion_alarm"
ZONE_TYPE_FIRE = "fire_alarm"

INTRUSION_TYPE_ENTRY_DELAY_1 = "entry_delay_1"
INTRUSION_TYPE_ENTRY_DELAY_2 = "entry_delay_2"
INTRUSION_TYPE_INTERIOR_FOLLOWER = "interior_follower"
INTRUSION_TYPE_INSTANT = "instant"
INTRUSION_TYPE_24_HOUR_PANIC = "24_hour_panic"
INTRUSION_TYPE_24_HOUR_MEDICAL = "24_hour_medical"
INTRUSION_TYPE_MOMENTARY_ARMING = "momentary_arming_switch"
INTRUSION_TYPE_MAINTAINED_ARMING = "maintained_arming_switch"
DEFAULT_INTRUSION_TYPE = INTRUSION_TYPE_ENTRY_DELAY_1

FIRE_TYPE_SMOKE = "fire_smoke"
FIRE_TYPE_HEAT = "fire_heat"
FIRE_TYPE_PULL = "fire_pull"
FIRE_TYPE_WATERFLOW = "fire_waterflow"
FIRE_TYPE_TROUBLE = "fire_trouble"
FIRE_TYPE_SUPERVISORY = "fire_supervisory"
DEFAULT_FIRE_TYPE = FIRE_TYPE_SMOKE

PARTITION_DISABLED = "disabled"
MIN_PARTITION = 1
MAX_PARTITION = 32

MIN_ALARM_USER = 1
MAX_ALARM_USER = 128
USER_LEVEL_DISABLED = "disabled"
USER_LEVEL_USER = "user"
USER_LEVEL_MANAGER = "manager"
USER_LEVEL_INSTALLER = "installer"
DEFAULT_USER_LEVEL = USER_LEVEL_DISABLED
USER_NAME_MAX_LEN = 32

CODE_TYPE_NUMERIC = "numeric"
CODE_TYPE_ALPHANUMERIC = "alphanumeric"
DEFAULT_CODE_TYPE = CODE_TYPE_NUMERIC
MIN_CODE_LENGTH = 4
MAX_CODE_LENGTH = 16
DEFAULT_CODE_LENGTH = 4

MIN_KEYPAD = 1
MAX_KEYPAD = 32
KEYPAD_ENABLED = "enabled"
KEYPAD_DISABLED = "disabled"
KEYPAD_NAME_MAX_LEN = 32
KEYPAD_TYPE_INTRUSION = "intrusion_alarm"
KEYPAD_TYPE_FIRE = "fire_alarm"
DEFAULT_KEYPAD_TYPE = KEYPAD_TYPE_INTRUSION

PARTITION_NAME_MAX_LEN = 16
ALARM_ACCOUNT_DISABLED = "disabled"
MIN_ALARM_ACCOUNT = 1
MAX_ALARM_ACCOUNT = 4
PROTOCOL_SIA = "sia"
PROTOCOL_CONTACT_ID = "contact_id"
DEFAULT_ACCOUNT_NUMBER = "0000"
DEFAULT_RECEIVER_IP = "0.0.0.0"
DEFAULT_RECEIVER_PORT = 3092

PARTITION_STATE_DISARMED = "disarmed"
PARTITION_STATE_ARMED = "armed"
PARTITION_STATE_ENTRY_DELAY = "entry_delay"
PARTITION_STATE_ALARM = "alarm"

CONF_ZONES = "zones"
CONF_PARTITIONS = "partitions"
CONF_KEYPADS = "keypads"
CONF_ALARM_USERS = "alarm_users"
CONF_OPTIONS = "options"
CONF_EVENT_LOG = "event_log"

PANEL_URL = "/alarm_zone_manager_panel"
PANEL_TITLE = "Alarm Zones"
PANEL_ICON = "mdi:shield-home"

ATTR_ZONE_ID = "zone_id"
ATTR_ZONE_NAME = "zone_name"
ATTR_EVENT = "event"

SERVICE_CONFIGURE_ZONE = "configure_zone"
SERVICE_TRIGGER_ZONE = "trigger_zone"
SERVICE_TEST_ZONE_ACTIVATE = "test_zone_activate"
SERVICE_FIRE_ZONE_EVENT = "fire_zone_event"


def delay_to_timedelta(
    hours: int = 0,
    minutes: int = 0,
    seconds: int = 0,
    milliseconds: int = 0,
) -> timedelta:
    """Convert delay parts to timedelta."""
    return timedelta(
        hours=hours,
        minutes=minutes,
        seconds=seconds,
        milliseconds=milliseconds,
    )


def delay_tuple(record: dict) -> tuple[int, int, int, int]:
    """Extract delay tuple from a zone or options record."""
    return (
        int(record.get("delay_hours", 0)),
        int(record.get("delay_minutes", 0)),
        int(record.get("delay_seconds", 0)),
        int(record.get("delay_milliseconds", DEFAULT_DELAY_MS)),
    )


def delay_from_tuple(
    tpl: tuple[int, int, int, int],
) -> dict[str, int]:
    """Build delay fields from tuple."""
    return {
        "delay_hours": tpl[0],
        "delay_minutes": tpl[1],
        "delay_seconds": tpl[2],
        "delay_milliseconds": tpl[3],
    }


def normalize_partition(zone_type: str, partition: str | int | None) -> str:
    """Normalize partition for zone type."""
    if zone_type not in (ZONE_TYPE_INTRUSION, ZONE_TYPE_FIRE):
        return PARTITION_DISABLED
    if partition in (None, "", PARTITION_DISABLED, "disabled"):
        return PARTITION_DISABLED
    return str(int(partition))
