"""
Admin-only routes: user management and the role -> page access matrix.

Every route here sits behind require_admin, so these are enforced server-side
regardless of what the frontend chooses to render.
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.core.security import get_password_hash, verify_password
from app.models.app_user import AppUser
from app.models.role_page_access import PAGE_KEYS, ROLES, RolePageAccess

router = APIRouter(tags=["admin"], dependencies=[Depends(require_admin)])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class UserRecord(BaseModel):
    id: str
    username: str
    role: str
    display_name: Optional[str] = None
    active: bool
    has_passcode: bool
    created_at: str


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    # 72 bytes is bcrypt's hard limit — anything longer is silently truncated,
    # which would make the extra characters meaningless.
    passcode: str = Field(min_length=8, max_length=72)
    role: str = "warehouse_staff"
    display_name: Optional[str] = None


class UpdateUserRequest(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    passcode: Optional[str] = Field(default=None, min_length=8, max_length=72)


class PageAccessRow(BaseModel):
    role: str
    page_key: str
    enabled: bool


class PageAccessMatrix(BaseModel):
    roles: List[str]
    page_keys: List[str]
    rows: List[PageAccessRow]


class TogglePageAccessRequest(BaseModel):
    role: str
    page_key: str
    enabled: bool


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

async def _reject_passcode_collision(
    db: AsyncSession, passcode: str, exclude_id=None
) -> None:
    """
    Refuse a passcode already in use by another account.

    Login resolves a passcode to a user by verifying candidates in turn and
    taking the first match, so two accounts sharing a passcode would silently
    send everyone to whichever row happens to be older.
    """
    result = await db.execute(
        select(AppUser).where(AppUser.passcode_hash.isnot(None))
    )
    for other in result.scalars().all():
        if exclude_id is not None and other.id == exclude_id:
            continue
        if verify_password(passcode, other.passcode_hash):
            raise HTTPException(
                status_code=400,
                detail=f"That passcode is already used by '{other.username}'",
            )


def _to_record(u: AppUser) -> UserRecord:
    return UserRecord(
        id=str(u.id),
        username=u.username,
        role=u.role,
        display_name=u.display_name,
        active=u.active,
        # Never return the hash itself — the screen only needs to know whether
        # this account can sign in at all.
        has_passcode=bool(u.passcode_hash),
        created_at=u.created_at.isoformat() if u.created_at else "",
    )


@router.get("/users", response_model=List[UserRecord])
async def list_users(db: AsyncSession = Depends(get_db)):
    """All accounts, active first, then newest."""
    result = await db.execute(
        select(AppUser).order_by(AppUser.active.desc(), AppUser.created_at.desc())
    )
    return [_to_record(u) for u in result.scalars().all()]


@router.post("/users", response_model=UserRecord, status_code=201)
async def create_user(
    payload: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a login. Usernames are stored lowercased and must be unique."""
    if payload.role not in ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"role must be one of {ROLES}",
        )

    username = payload.username.strip().lower()
    existing = await db.execute(
        select(AppUser).where(func.lower(AppUser.username) == username)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="That username is already taken")

    await _reject_passcode_collision(db, payload.passcode)

    user = AppUser(
        username=username,
        # Unused under passcode login, but the column is NOT NULL. A literal
        # marker no bcrypt verify can match keeps the password path dead.
        password_hash="x",
        passcode_hash=get_password_hash(payload.passcode),
        role=payload.role,
        display_name=payload.display_name,
        active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _to_record(user)


@router.patch("/users/{user_id}", response_model=UserRecord)
async def update_user(
    user_id: str,
    payload: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    current: AppUser = Depends(require_admin),
):
    """
    Update a user: rename, change role, reset password, or deactivate.

    Accounts are deactivated rather than deleted so historical packing lists
    keep pointing at a real created_by.
    """
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user id")

    result = await db.execute(select(AppUser).where(AppUser.id == uid))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.role is not None and payload.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of {ROLES}")

    # Guard against an admin locking themselves out of their own admin screen.
    is_self = user.id == current.id
    if is_self and payload.active is False:
        raise HTTPException(
            status_code=400, detail="You cannot deactivate your own account"
        )
    if is_self and payload.role is not None and payload.role != "admin":
        raise HTTPException(
            status_code=400, detail="You cannot remove your own admin role"
        )

    if payload.passcode is not None:
        await _reject_passcode_collision(db, payload.passcode, exclude_id=user.id)
        user.passcode_hash = get_password_hash(payload.passcode)

    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.role is not None:
        user.role = payload.role
    if payload.active is not None:
        user.active = payload.active

    await db.commit()
    await db.refresh(user)
    return _to_record(user)


# ---------------------------------------------------------------------------
# Page access
# ---------------------------------------------------------------------------

@router.get("/page-access", response_model=PageAccessMatrix)
async def get_page_access(db: AsyncSession = Depends(get_db)):
    """
    The full role x page matrix.

    Any (role, page) pair missing from the table is returned as enabled=False,
    so the admin screen always shows a complete grid even if the seed missed a
    newly added page.
    """
    result = await db.execute(select(RolePageAccess))
    stored = {(r.role, r.page_key): r.enabled for r in result.scalars().all()}

    rows = [
        PageAccessRow(
            role=role,
            page_key=page_key,
            enabled=stored.get((role, page_key), False),
        )
        for role in ROLES
        for page_key in PAGE_KEYS
    ]
    return PageAccessMatrix(roles=ROLES, page_keys=PAGE_KEYS, rows=rows)


@router.post("/page-access", response_model=PageAccessRow)
async def set_page_access(
    payload: TogglePageAccessRequest,
    db: AsyncSession = Depends(get_db),
):
    """Toggle one cell of the matrix. Upserts so a missing row is created."""
    if payload.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of {ROLES}")
    if payload.page_key not in PAGE_KEYS:
        raise HTTPException(
            status_code=400, detail=f"page_key must be one of {PAGE_KEYS}"
        )

    # Without this an admin could switch off 'admin' for their own role and lose
    # the only screen that can switch it back on.
    if payload.role == "admin" and payload.page_key == "admin" and not payload.enabled:
        raise HTTPException(
            status_code=400,
            detail="Admin access to the admin page cannot be switched off",
        )

    result = await db.execute(
        select(RolePageAccess).where(
            RolePageAccess.role == payload.role,
            RolePageAccess.page_key == payload.page_key,
        )
    )
    row = result.scalar_one_or_none()

    if row is None:
        row = RolePageAccess(
            role=payload.role, page_key=payload.page_key, enabled=payload.enabled
        )
        db.add(row)
    else:
        row.enabled = payload.enabled

    await db.commit()
    return PageAccessRow(
        role=payload.role, page_key=payload.page_key, enabled=payload.enabled
    )
