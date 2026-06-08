"""Tests for sort helpers."""

from custom_components.alarm_zone_manager.sort import sort_event_log, sort_zones


def test_sort_zones_by_id():
    zones = [{"zone_id": 3, "zone_name": "C", "zone_type": "automation", "action": "disabled", "partition": "disabled"},
             {"zone_id": 1, "zone_name": "A", "zone_type": "automation", "action": "disabled", "partition": "disabled"}]
    sorted_z = sort_zones(zones, "zone_id", "asc")
    assert sorted_z[0]["zone_id"] == 1


def test_sort_event_log_desc():
    entries = [
        {"sequential_id": 1, "timestamp": "2026-01-01T00:00:00Z"},
        {"sequential_id": 3, "timestamp": "2026-01-03T00:00:00Z"},
    ]
    sorted_e = sort_event_log(entries, "sequential_id", "desc")
    assert sorted_e[0]["sequential_id"] == 3
