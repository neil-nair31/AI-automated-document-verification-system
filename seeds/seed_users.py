#!/usr/bin/env python3
"""Seed default ADMIN and OPERATOR users for local development.

Idempotent: safe to run multiple times. Passwords come from SEED_DEFAULT_PASSWORD
in the environment (default: changeme-dev-only).

Usage:
    python -m seeds.seed_users
    docker compose run --rm api python -m seeds.seed_users
"""

from __future__ import annotations

import os
import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.enums import Role
from app.models.user import User

DEFAULT_USERS = (
    ("admin@rts.com", Role.ADMIN),
    ("operator@rts.com", Role.OPERATOR),
)


def seed_users() -> None:
    password = os.environ.get("SEED_DEFAULT_PASSWORD", "changeme-dev-only")
    if len(password) < 8:
        print("SEED_DEFAULT_PASSWORD must be at least 8 characters", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    try:
        created = 0
        updated = 0
        for email, role in DEFAULT_USERS:
            user = db.scalar(select(User).where(User.email == email))
            hashed = hash_password(password)
            if user is None:
                db.add(
                    User(
                        email=email,
                        password_hash=hashed,
                        role=role,
                        is_active=True,
                    )
                )
                created += 1
            else:
                user.password_hash = hashed
                user.role = role
                user.is_active = True
                updated += 1
        db.commit()
        print(f"Seeded users: {created} created, {updated} updated (password from SEED_DEFAULT_PASSWORD).")
    finally:
        db.close()


if __name__ == "__main__":
    seed_users()
