"""Single uploaded document tied to a verification job."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from sqlalchemy import Enum as SAEnum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import DocumentType
from app.models._mixins import TimestampsCreated, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.check import CheckResult
    from app.models.verification import Verification


class Document(UUIDPrimaryKey, TimestampsCreated, Base):
    __tablename__ = "documents"

    verification_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("verifications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    document_type: Mapped[DocumentType] = mapped_column(
        SAEnum(DocumentType, name="document_type_enum", native_enum=False, length=32),
        nullable=False,
    )

    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    # Relative path under settings.storage_dir. We never store absolute paths.
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # Populated by the EXTRACTION stage.
    ocr_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    extracted_fields: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    # Per-field confidence map mirroring `extracted_fields` keys, e.g.
    # {"passport_number": 0.92, "expiry_date": 0.71, "mrz_line1": 0.55}.
    field_confidences: Mapped[Optional[Dict[str, float]]] = mapped_column(JSONB, nullable=True)
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    verification: Mapped["Verification"] = relationship(back_populates="documents")
    checks: Mapped[List["CheckResult"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Document {self.id} {self.document_type.value}>"
