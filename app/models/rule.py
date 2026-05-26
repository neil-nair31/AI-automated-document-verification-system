"""Country-specific rule configuration.

The full rule set for a country lives in a single JSONB blob so admins can
edit it as one document via `PUT /rules/{country}`. Each PUT bumps `version`
and stamps `updated_by`; the previous payload is recorded in the audit log so
we can reproduce historical verdicts.

Expected shape of `config` (illustrative — actual schema is enforced by
Pydantic validators in `app/schemas/rule.py`):

    {
      "thresholds": {
        "genuine_min": 0.80,
        "review_min": 0.55,
        "unreadable_ocr_min": 0.30
      },
      "signal_weights": {
        "uscis": 1.0, "e_verify": 0.9, "nsc": 0.8,
        "mrz_checksum": 0.9, "internal_consistency": 0.7,
        "cross_doc_identity": 0.8, "ead_category_match": 1.0,
        "ocr_confidence": 0.6, "public_profile": 0.2
      },
      "documents": {
        "PASSPORT": {
          "required_fields": ["passport_number", "expiry_date", "dob",
                              "given_names", "surname"],
          "min_field_confidence": 0.7,
          "min_doc_confidence": 0.65,
          "passport_number_regex": "^[A-Z0-9]{6,9}$",
          "min_validity_days": 180
        },
        "EAD_I766": {
          "required_fields": ["card_number", "category", "valid_to"],
          "high_weight_categories": ["C09", "C36"],
          "valid_categories": ["A03","A05","C08","C09","C26","C36"]
        }
        // ...
      }
    }
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any, Dict, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models._mixins import TimestampsCreatedUpdated, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.user import User


class CountryRule(UUIDPrimaryKey, TimestampsCreatedUpdated, Base):
    __tablename__ = "country_rules"
    __table_args__ = (
        # One active row per country at any time; older versions stay around
        # for traceability but only the highest-version active row is used.
        UniqueConstraint("country", "version", name="uq_country_rules_country_version"),
    )

    country: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    config: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False)

    updated_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_by: Mapped[Optional["User"]] = relationship()

    def __repr__(self) -> str:  # pragma: no cover
        return f"<CountryRule {self.country} v{self.version} active={self.is_active}>"
