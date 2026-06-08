"""Tests for store seeding."""

from custom_components.alarm_zone_manager.store import (
    default_options,
    seed_alarm_user,
    seed_keypad,
    seed_partition,
    seed_zone,
)


def test_seed_zone_defaults():
    z = seed_zone(42)
    assert z["zone_id"] == 42
    assert z["zone_name"] == "Zone 42"
    assert z["intrusion_type"] == "entry_delay_1"
    assert z["fire_type"] == "fire_smoke"


def test_seed_partition():
    p = seed_partition(5)
    assert p["partition_id"] == 5


def test_seed_keypad():
    k = seed_keypad(2)
    assert k["keypad_id"] == 2
    assert k["partition_ids"] == []


def test_seed_user_has_all_partitions():
    u = seed_alarm_user(1)
    assert len(u["partition_ids"]) == 32


def test_default_options():
    o = default_options()
    assert o["intrusion_entry_delay_1_seconds"] == 30
    assert len(o["alarm_accounts"]) == 4
