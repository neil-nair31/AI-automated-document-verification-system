"""Integration tests for /auth/login, /auth/me, and RBAC guards."""

from __future__ import annotations

import pytest

from tests.conftest import (
    TEST_ADMIN_EMAIL,
    TEST_OPERATOR_EMAIL,
    TEST_PASSWORD,
    requires_db,
)


@requires_db
def test_login_success_and_me(client, auth_users):
    response = client.post(
        "/auth/login",
        json={"email": TEST_OPERATOR_EMAIL, "password": TEST_PASSWORD},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == TEST_OPERATOR_EMAIL
    assert body["user"]["role"] == "OPERATOR"

    token = body["access_token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == TEST_OPERATOR_EMAIL


@requires_db
def test_login_bad_password(client, auth_users):
    response = client.post(
        "/auth/login",
        json={"email": TEST_OPERATOR_EMAIL, "password": "wrong-password-xyz"},
    )
    assert response.status_code == 401


@requires_db
def test_admin_ping_rbac(client, auth_users):
    admin_login = client.post(
        "/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_PASSWORD},
    )
    admin_token = admin_login.json()["access_token"]
    ok = client.get("/admin/ping", headers={"Authorization": f"Bearer {admin_token}"})
    assert ok.status_code == 200

    op_login = client.post(
        "/auth/login",
        json={"email": TEST_OPERATOR_EMAIL, "password": TEST_PASSWORD},
    )
    op_token = op_login.json()["access_token"]
    forbidden = client.get("/admin/ping", headers={"Authorization": f"Bearer {op_token}"})
    assert forbidden.status_code == 403
