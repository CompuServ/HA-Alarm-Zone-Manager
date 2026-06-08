"""Alarm receiver helpers (v1 config only)."""

from __future__ import annotations

from typing import Any


def get_account_config(options: dict[str, Any], account_id: int) -> dict[str, Any] | None:
    """Return alarm account config by id."""
    for account in options.get("alarm_accounts", []):
        if account.get("account_id") == account_id:
            return account
    return None
