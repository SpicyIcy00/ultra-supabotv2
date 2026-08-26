from datetime import datetime, timedelta
from typing import Any, Optional, Union
import bcrypt
from jose import jwt
from app.core.config import settings

# bcrypt is used directly rather than through passlib. passlib 1.7.4 (the last
# release, from 2020) probes for a historical bcrypt bug by hashing a >72-byte
# test string; bcrypt 4.x truncated that silently but bcrypt 5.0 raises
# ValueError, which makes CryptContext.hash() fail for *every* password on the
# version pinned in requirements.txt. Calling bcrypt directly sidesteps that and
# produces identical $2b$ hashes, so existing hashes keep verifying.

# bcrypt only considers the first 72 bytes of a password and raises on anything
# longer, so inputs are truncated to that boundary before hashing or verifying.
_BCRYPT_MAX_BYTES = 72


def _prepare(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def create_access_token(
    subject: Union[str, Any],
    expires_delta: timedelta = None,
    extra_claims: Optional[dict] = None,
) -> str:
    """
    Create JWT access token.

    extra_claims lets callers stamp non-secret context onto the token (e.g. the
    user's role) so protected routes can authorize without a DB round-trip.
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode = {"exp": expire, "sub": str(subject)}
    if extra_claims:
        to_encode.update(extra_claims)
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    try:
        return bcrypt.checkpw(_prepare(plain_password), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        # Malformed or empty hash in the row — treat as a failed login rather
        # than letting a 500 leak the fact that the account exists.
        return False


def get_password_hash(password: str) -> str:
    """Hash a password for storing."""
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt()).decode("utf-8")
