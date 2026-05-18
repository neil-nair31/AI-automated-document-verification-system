"""Health endpoint — DB roundtrip + app version.

Implemented in the scaffold phase so docker-compose has something to probe.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import __version__
from app.database import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:  # pragma: no cover - defensive
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "version": __version__,
        "database": "up" if db_ok else "down",
    }
