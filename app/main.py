"""FastAPI application entrypoint."""

from __future__ import annotations

from fastapi import FastAPI

from app import __version__
from app.core.deps import AdminUser
from app.routers import auth, health
from app.schemas.auth import UserPublic


def create_app() -> FastAPI:
    app = FastAPI(
        title="Work-Permit & Document Verification API",
        version=__version__,
        description=(
            "Deterministic, rule-based document verification platform. "
            "Phase 2 adds JWT auth; verifications and rules routes follow in later phases."
        ),
    )
    app.include_router(health.router)
    app.include_router(auth.router)

    @app.get("/admin/ping", tags=["admin"], response_model=UserPublic)
    def admin_ping(admin: AdminUser) -> UserPublic:
        """RBAC smoke test — ADMIN only until dedicated admin routes land."""
        return UserPublic.model_validate(admin)

    return app


app = create_app()
    
