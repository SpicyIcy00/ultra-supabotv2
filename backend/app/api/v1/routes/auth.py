"""
Authentication routes.

- POST /auth/login            passcode -> JWT (no username)
- GET  /auth/me               the caller's identity, role and allowed page_keys
- POST /auth/change-passcode  change your own passcode
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_allowed_pages, get_current_user
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.app_user import AppUser

router = APIRouter(tags=["auth"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    passcode: str


class CurrentUser(BaseModel):
    id: str
    username: str
    role: str
    display_name: Optional[str] = None
    allowed_pages: List[str]


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: CurrentUser


class ChangePasscodeRequest(BaseModel):
    current_passcode: str
    new_passcode: str = Field(min_length=8, max_length=72)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Exchange a passcode for a JWT. No username — the passcode identifies the
    account, which supplies the role.

    Passcodes are bcrypt-hashed, so they cannot be looked up by value; every
    candidate has to be verified in turn. Only active accounts that actually
    have a passcode are considered, which in practice is one row per role.
    """
    candidates = await db.execute(
        select(AppUser)
        .where(AppUser.active.is_(True), AppUser.passcode_hash.isnot(None))
        .order_by(AppUser.created_at)
    )

    user = None
    for candidate in candidates.scalars().all():
        if verify_password(payload.passcode, candidate.passcode_hash):
            user = candidate
            break

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect passcode",
        )

    token = create_access_token(subject=user.id, extra_claims={"role": user.role})
    allowed = await get_allowed_pages(db, user.role)

    return LoginResponse(
        access_token=token,
        user=CurrentUser(
            id=str(user.id),
            username=user.username,
            role=user.role,
            display_name=user.display_name,
            allowed_pages=allowed,
        ),
    )


@router.get("/me", response_model=CurrentUser)
async def me(
    user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Who am I, and what may I see?

    The frontend calls this on every load so a revoked page or a deactivated
    account takes effect without waiting for the token to expire.
    """
    allowed = await get_allowed_pages(db, user.role)
    return CurrentUser(
        id=str(user.id),
        username=user.username,
        role=user.role,
        display_name=user.display_name,
        allowed_pages=allowed,
    )


@router.post("/change-passcode", status_code=204)
async def change_passcode(
    payload: ChangePasscodeRequest,
    user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change your own passcode. Requires the current one."""
    if not user.passcode_hash or not verify_password(
        payload.current_passcode, user.passcode_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current passcode is incorrect",
        )

    user.passcode_hash = get_password_hash(payload.new_passcode)
    await db.commit()
