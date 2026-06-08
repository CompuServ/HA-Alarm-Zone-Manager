"""Tests for validation helpers."""

import pytest

from custom_components.alarm_zone_manager.validation import (
    is_weak_user_code,
    sync_default_debounce_to_zones,
    validate_intrusion_entry_delay,
    validate_zone_name,
    validate_zone_test_duration_ms,
)


def test_validate_zone_name():
    assert validate_zone_name("Zone1")
    assert not validate_zone_name("")
    assert not validate_zone_name("Zone 1")


def test_weak_codes():
    assert is_weak_user_code("0000", "numeric", 4)
    assert is_weak_user_code("1234", "numeric", 4)
    assert is_weak_user_code("4321", "numeric", 4)
    assert not is_weak_user_code("1357", "numeric", 4)


def test_entry_delay_validation():
    assert validate_intrusion_entry_delay(30)
    assert validate_intrusion_entry_delay(10)
    assert validate_intrusion_entry_delay(300)
    assert not validate_intrusion_entry_delay(5)


def test_zone_test_duration():
    assert validate_zone_test_duration_ms(100)
    assert validate_zone_test_duration_ms(300000)
    assert not validate_zone_test_duration_ms(50)


def test_sync_default_debounce():
    old = (0, 0, 0, 250)
    new = (0, 0, 0, 500)
    zones = [
        {"zone_id": 1, "delay_hours": 0, "delay_minutes": 0, "delay_seconds": 0, "delay_milliseconds": 250},
        {"zone_id": 2, "delay_hours": 0, "delay_minutes": 0, "delay_seconds": 1, "delay_milliseconds": 0},
    ]
    result = sync_default_debounce_to_zones(old, new, zones)
    assert result[0]["delay_milliseconds"] == 500
    assert result[1]["delay_seconds"] == 1
