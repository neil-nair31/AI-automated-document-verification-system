"""Single check outcome produced by one pipeline stage.

A verification accumulates many `CheckResult` rows — one per rule evaluated.
The risk verdict is computed by weighting these rows.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any, Dict, Optional

from sqlalchemy import Enum as SAEnum, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import CheckStatus, PipelineStage
from app.models._mixins import TimestampsCreated, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.document import Document
    from app.models.verification import Verification


class CheckResult(UUIDPrimaryKey, TimestampsCreated, Base):
    __tablename__ = "check_results"

    verification_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("verifications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # NULL when the check spans multiple documents (cross-doc, external,
    # final risk verdict) or applies to the verification as a whole.
    document_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    stage: Mapped[PipelineStage] = mapped_column(
        SAEnum(PipelineStage, name="pipeline_stage_enum", native_enum=False, length=48),
        nullable=False,
        index=True,
    )
    # Stable, machine-readable check identifier (e.g. "passport.mrz_checksum",
    # "ead.category_matches_i797c", "cross.identity_name_match").
    name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    status: Mapped[CheckStatus] = mapped_column(
        SAEnum(CheckStatus, name="check_status_enum", native_enum=False, length=16),
        nullable=False,
    )

    # Normalised 0..1 score (1 = strong positive, 0 = strong negative).
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Weight applied when aggregating into the final risk score. Pulled from
    # the country rule config at evaluation time and stored here so historical
    # verdicts remain reproducible even after rules change.
    weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Human-readable reason — surfaced verbatim in the GET /verifications/{id}
    # response. Every check, pass or fail, must populate this.
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    # Structured details (regex matches, dates compared, vendor payload, ...).
    details: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    verification: Mapped["Verification"] = relationship(back_populates="checks")
    document: Mapped[Optional["Document"]] = relationship(back_populates="checks")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<CheckResult {self.stage.value}:{self.name} {self.status.value}>"
