"""Immutable audit log.

Rows are insert-only. No update or delete endpoints exist, and the model
exposes no setter helpers for mutating fields after creation. Every
verification mutation (creation, stage start/finish, individual check,
verdict, rule update, login outcome) lands here.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any, Dict, Optional

from sqlalchemy import Enum as SAEnum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import AuditAction, PipelineStage
from app.models._mixins import TimestampsCreated, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.verification import Verification


class AuditLog(UUIDPrimaryKey, TimestampsCreated, Base):
    __tablename__ = "audit_logs"

    # NULL for system-wide events that aren't tied to a single verification
    # (e.g. RULES_UPDATED, LOGIN_*).
    verification_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("verifications.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # NULL when the actor is the system (e.g. async pipeline worker).
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    action: Mapped[AuditAction] = mapped_column(
        SAEnum(AuditAction, name="audit_action_enum", native_enum=False, length=48),
        nullable=False,
        index=True,
    )
    # Optional — populated when the entry is stage-scoped.
    stage: Mapped[Optional[PipelineStage]] = mapped_column(
        SAEnum(PipelineStage, name="pipeline_stage_enum", native_enum=False, length=48),
        nullable=True,
    )

    message: Mapped[str] = mapped_column(String(512), nullable=False)
    details: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    verification: Mapped[Optional["Verification"]] = relationship(back_populates="audit_entries")
    actor: Mapped[Optional["User"]] = relationship()

    def __repr__(self) -> str:  # pragma: no cover
        return f"<AuditLog {self.action.value} ver={self.verification_id}>"
