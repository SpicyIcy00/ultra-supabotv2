"""
Auth dependencies for protected routes.

These are the real access control. The frontend guard only decides what to
*render* — every protected endpoint re-checks the caller here, so a staff user
who types an admin URL, or hits the API directly with curl, still gets a 403.

Usage:
    @router.get("/thing", dependencies=[Depends(require_admin)])
    @router.get("/thing", dependencies=[Depends(require_page("packing"))])
    async def handler(user: AppUser = Depends(get_current_user)): ...
"""
import uuid
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.app_user import AppUser
from app.models.role_page_access import RolePageAccess

# auto_error=False so a missing header produces our own 401 with a clear
# message rather than FastAPI's bare "Not authenticated".
_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> AppUser:
    """Decode the bearer token and return the live user row."""
    if credentials is None:
        raise _unauthorized("Not authenticated")

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except JWTError:
        raise _unauthorized("Invalid or expired token")

    subject = payload.get("sub")
    if not subject:
        raise _unauthorized("Invalid token payload")

    try:
        user_id = uuid.UUID(subject)
    except (ValueError, TypeError):
        raise _unauthorized("Invalid token subject")

    # Re-read the user rather than trusting the token's claims: this is what
    # makes deactivating an account (or changing its role) take effect on the
    # user's very next request instead of whenever their token happens to expire.
    result = await db.execute(select(AppUser).where(AppUser.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise _unauthorized("User no longer exists")
    if not user.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated",
        )

    return user


async def require_admin(user: AppUser = Depends(get_current_user)) -> AppUser:
    """Allow only role='admin'."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return user


def require_page(page_key: str):
    """
    Build a dependency that allows the request only if the caller's role has
    role_page_access.enabled = TRUE for page_key.

    Access is read from the table on each request, so toggling a page in the
    admin screen takes effect immediately with no redeploy and no re-login.
    """

    async def _check(
        user: AppUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> AppUser:
        result = await db.execute(
            select(RolePageAccess.enabled).where(
                RolePageAccess.role == user.role,
                RolePageAccess.page_key == page_key,
            )
        )
        enabled = result.scalar_one_or_none()

        # Absent row == no access. Denying by default means adding a new page
        # never accidentally exposes it to a role that was never granted it.
        if not enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your role does not have access to '{page_key}'",
            )
        return user

    return _check


async def get_allowed_pages(db: AsyncSession, role: str) -> list[str]:
    """Every page_key currently enabled for a role."""
    result = await db.execute(
        select(RolePageAccess.page_key)
        .where(RolePageAccess.role == role, RolePageAccess.enabled.is_(True))
        .order_by(RolePageAccess.page_key)
    )
    return list(result.scalars().all())
