"""Authentication routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.deps import CurrentUser
from app.core.security import create_access_token, verify_password
from app.database import get_db
from app.enums import AuditAction
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserPublic
from app.services.audit import record_audit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    settings = get_settings()
    user = db.scalar(select(User).where(User.email == body.email))

    def _fail(reason: str) -> None:
        record_audit(
            db,
            action=AuditAction.LOGIN_FAILED,
            message=f"Login failed for {body.email}",
            actor_id=user.id if user else None,
            details={"email": body.email, "reason": reason},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if user is None:
        _fail("unknown_user")
    if not user.is_active:
        _fail("inactive_user")
    if not verify_password(body.password, user.password_hash):
        _fail("bad_password")

    token = create_access_token(subject=user.id, role=user.role.value)
    record_audit(
        db,
        action=AuditAction.LOGIN_SUCCEEDED,
        message=f"Login succeeded for {user.email}",
        actor_id=user.id,
        details={"email": user.email, "role": user.role.value},
    )
    db.commit()

    expires_in = settings.jwt_expires_minutes * 60
    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        user=UserPublic.model_validate(user),
    )


@router.get("/me", response_model=UserPublic)
def me(current_user: CurrentUser) -> UserPublic:
    return UserPublic.model_validate(current_user)
