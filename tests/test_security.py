"""Unit tests for password hashing and JWT helpers (no database)."""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.enums import Role


def test_password_hash_roundtrip():
    hashed = hash_password("correct-horse-battery")
    assert verify_password("correct-horse-battery", hashed)
    assert not verify_password("wrong-password", hashed)


def test_jwt_roundtrip():
    user_id = uuid4()
    token = create_access_token(subject=user_id, role=Role.ADMIN.value, expires_minutes=5)
    payload = decode_access_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["role"] == Role.ADMIN.value


def test_jwt_rejects_garbage():
    with pytest.raises(ValueError):
        decode_access_token("not.a.jwt")
