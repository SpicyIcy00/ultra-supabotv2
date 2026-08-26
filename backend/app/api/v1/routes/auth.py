"""
Authentication routes.

- POST /auth/login   username + password -> JWT
- GET  /auth/me      the caller's identity, role and allowed page_keys
- POST /auth/change-password  change your own password
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
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
    username: str
    password: str


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


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Exchange username + password for a JWT."""
    username = payload.username.strip().lower()

    result = await db.execute(
        select(AppUser).where(func.lower(AppUser.username) == username)
    )
    user = result.scalar_one_or_none()

    # Same message for "no such user" and "wrong password" so the endpoint
    # cannot be used to enumerate valid usernames.
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username or password",
    )
    if user is None or not verify_password(payload.password, user.password_hash):
        raise invalid
    if not user.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated",
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


@router.post("/change-password", status_code=204)
async def change_password(
    payload: ChangePasswordRequest,
    user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change your own password. Requires the current one."""
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    user.password_hash = get_password_hash(payload.new_password)
    await db.commit()
