"""FastAPI application entrypoint.

Scaffold phase: only the health router is wired up. Auth, verifications,
and rules routers are added in subsequent phases.
"""

from __future__ import annotations

from fastapi import FastAPI

from app import __version__
from app.routers import health


def create_app() -> FastAPI:
    app = FastAPI(
        title="Work-Permit & Document Verification API",
        version=__version__,
        description=(
            "Deterministic, rule-based document verification platform. "
            "MVP scaffold — pipeline, auth, and routes are added in later phases."
        ),
    )
    app.include_router(health.router)
    return app


app = create_app(
    
