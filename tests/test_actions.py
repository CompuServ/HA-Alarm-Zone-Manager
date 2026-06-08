"""Tests for action resolution."""

from custom_components.alarm_zone_manager.actions import resolve_action
from custom_components.alarm_zone_manager.const import (
    ACTION_MIRROR,
    ACTION_DISABLED,
    ZONE_TYPE_AUTOMATION,
    ZONE_TYPE_INTRUSION,
)


def test_resolve_automation_zone():
    zone = {
        "zone_type": ZONE_TYPE_AUTOMATION,
        "action": ACTION_MIRROR,
        "output_entity_id": "switch.test",
    }
    cfg = resolve_action(zone, None)
    assert cfg["action"] == ACTION_MIRROR
    assert cfg["output_entity_id"] == "switch.test"


def test_resolve_intrusion_uses_partition():
    zone = {
        "zone_type": ZONE_TYPE_INTRUSION,
        "partition": "2",
        "output_entity_id": "switch.siren",
    }
    partition = {"activation_action": ACTION_MIRROR, "activate_entity_id": None}
    cfg = resolve_action(zone, partition)
    assert cfg["action"] == ACTION_MIRROR


def test_resolve_intrusion_no_partition():
    zone = {"zone_type": ZONE_TYPE_INTRUSION, "partition": "disabled"}
    cfg = resolve_action(zone, None)
    assert cfg["action"] == ACTION_DISABLED
