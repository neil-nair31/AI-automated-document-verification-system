"""Application users (ADMIN / OPERATOR)."""

from __future__ import annotations

from typing import TYPE_CHECKING, List

from sqlalchemy import Boolean, Enum as SAEnum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import Role
from app.models._mixins import TimestampsCreatedUpdated, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.verification import Verification


class User(UUIDPrimaryKey, TimestampsCreatedUpdated, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(
        SAEnum(Role, name="role_enum", native_enum=False, length=32),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    verifications: Mapped[List["Verification"]] = relationship(
        back_populates="operator",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User {self.email} role={self.role.value}>"
