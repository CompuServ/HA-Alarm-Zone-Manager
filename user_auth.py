"""User authentication and code management."""

from __future__ import annotations

import hashlib
import secrets
from typing import Any

from .validation import is_weak_user_code, validate_user_code


def hash_user_code(code: str) -> str:
    """Hash user code for storage."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", code.encode("utf-8"), salt.encode("utf-8"), 100000
    ).hex()
    return f"{salt}${digest}"


def verify_user_code_hash(code: str, stored: str | None) -> bool:
    """Verify code against stored hash."""
    if not stored or "$" not in stored:
        return False
    salt, digest = stored.split("$", 1)
    check = hashlib.pbkdf2_hmac(
        "sha256", code.encode("utf-8"), salt.encode("utf-8"), 100000
    ).hex()
    return secrets.compare_digest(check, digest)


def generate_random_user_code(
    options: dict[str, Any],
    existing_hashes: list[str | None],
    exclude_user_number: int | None = None,
    max_attempts: int = 100,
) -> str:
    """Generate random numeric user code."""
    length = int(options.get("alarm_user_code_length", 4))
    for _ in range(max_attempts):
        code = "".join(str(secrets.randbelow(10)) for _ in range(length))
        if is_weak_user_code(code, "numeric", length):
            continue
        if any(verify_user_code_hash(code, h) for h in existing_hashes if h):
            continue
        return code
    raise ValueError("Unable to generate unique code")


def user_has_partition_access(user: dict[str, Any], partition_id: int) -> bool:
    """Check user partition access."""
    return partition_id in user.get("partition_ids", [])


def validate_all_user_codes(
    users: list[dict[str, Any]], options: dict[str, Any]
) -> list[int]:
    """Revalidate all active users; return invalid user numbers."""
    invalid = []
    for user in users:
        if user.get("user_level") == "disabled":
            user["code_invalid_length"] = False
            user["code_invalid_format"] = False
            user["code_weak"] = False
            continue
        if not user.get("has_code"):
            continue
        # Cannot revalidate without plaintext; flags preserved from last save
        if any(
            user.get(k)
            for k in ("code_invalid_length", "code_invalid_format", "code_weak")
        ):
            invalid.append(user["user_number"])
    return invalid


def apply_user_code(
    user: dict[str, Any], code: str | None, options: dict[str, Any]
) -> dict[str, Any]:
    """Apply and validate user code on save."""
    u = dict(user)
    if u.get("user_level") == "disabled" or not code:
        if not code:
            u["user_code_hash"] = None
            u["has_code"] = False
        return u
    flags = validate_user_code(code, options, u["user_level"])
    u.update(flags)
    if any(flags.values()):
        return u
    u["user_code_hash"] = hash_user_code(code)
    u["has_code"] = True
    return u
