"""Pytest fixtures — integration tests require a migrated Postgres database."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.enums import Role
from app.main import app
from app.models.user import User

TEST_ADMIN_EMAIL = "test-admin@rts.com"
TEST_OPERATOR_EMAIL = "test-operator@rts.com"
TEST_PASSWORD = "test-password-123"


def _database_available() -> bool:
    if os.environ.get("SKIP_DB_TESTS", "").lower() in ("1", "true", "yes"):
        return False
    try:
        from sqlalchemy import text

        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return True
    except Exception:
        return False


requires_db = pytest.mark.skipif(
    not _database_available(),
    reason="Postgres not available (run migrations and set POSTGRES_* / DATABASE_URL)",
)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def auth_users(db_session):
    """Ensure dedicated test users exist; remove tokens are not needed."""
    users = {}
    for email, role in (
        (TEST_ADMIN_EMAIL, Role.ADMIN),
        (TEST_OPERATOR_EMAIL, Role.OPERATOR),
    ):
        user = db_session.scalar(select(User).where(User.email == email))
        hashed = hash_password(TEST_PASSWORD)
        if user is None:
            user = User(email=email, password_hash=hashed, role=role, is_active=True)
            db_session.add(user)
        else:
            user.password_hash = hashed
            user.role = role
            user.is_active = True
        users[role] = user
    db_session.commit()
    for role, user in users.items():
        db_session.refresh(user)
    return users
