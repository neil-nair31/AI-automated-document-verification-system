"""Top-level verification job — owns documents, checks, and audit entries."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, Enum as SAEnum, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import RiskLevel, Verdict, VerificationStatus
from app.models._mixins import TimestampsCreatedUpdated, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.audit import AuditLog
    from app.models.check import CheckResult
    from app.models.document import Document
    from app.models.user import User


class Verification(UUIDPrimaryKey, TimestampsCreatedUpdated, Base):
    __tablename__ = "verifications"

    operator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # ISO 3166-1 alpha-2 (e.g. "US", "IN"). Drives which CountryRule config applies.
    country: Mapped[str] = mapped_column(String(2), nullable=False, index=True)

    status: Mapped[VerificationStatus] = mapped_column(
        SAEnum(VerificationStatus, name="verification_status_enum", native_enum=False, length=32),
        nullable=False,
        default=VerificationStatus.PENDING,
    )

    # Populated by the RISK_VERDICT stage.
    verdict: Mapped[Optional[Verdict]] = mapped_column(
        SAEnum(Verdict, name="verdict_enum", native_enum=False, length=32),
        nullable=True,
    )
    risk_level: Mapped[Optional[RiskLevel]] = mapped_column(
        SAEnum(RiskLevel, name="risk_level_enum", native_enum=False, length=32),
        nullable=True,
    )
    risk_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    operator: Mapped["User"] = relationship(back_populates="verifications")
    documents: Mapped[List["Document"]] = relationship(
        back_populates="verification",
        cascade="all, delete-orphan",
        order_by="Document.created_at",
    )
    checks: Mapped[List["CheckResult"]] = relationship(
        back_populates="verification",
        cascade="all, delete-orphan",
        order_by="CheckResult.created_at",
    )
    audit_entries: Mapped[List["AuditLog"]] = relationship(
        back_populates="verification",
        cascade="all, delete-orphan",
        order_by="AuditLog.created_at",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Verification {self.id} {self.country} {self.status.value}>"
