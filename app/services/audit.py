"""Append-only audit log writes."""

from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.enums import AuditAction
from app.models.audit import AuditLog


def record_audit(
    db: Session,
    *,
    action: AuditAction,
    message: str,
    actor_id: Optional[UUID] = None,
    verification_id: Optional[UUID] = None,
    details: Optional[Dict[str, Any]] = None,
) -> AuditLog:
    entry = AuditLog(
        action=action,
        message=message,
        actor_id=actor_id,
        verification_id=verification_id,
        details=details,
    )
    db.add(entry)
    return entry
