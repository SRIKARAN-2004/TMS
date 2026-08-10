from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

from jose import jwt, JWTError
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    # jti (JWT ID): a unique identifier for this specific token, independent
    # of its expiry or its subject. Without it, there was no way to revoke a
    # single issued token - logout could only clear the cookie client-side,
    # so a copy of the token captured before logout (via XSS, a proxy log, a
    # shared machine) stayed valid for the rest of its 8h lifetime no matter
    # what the user did. With a jti, logout can record *this one token* as
    # revoked without needing to invalidate every token for the user.
    #
    # "type": "access" is checked by get_current_user - without it, a
    # refresh token (which lives far longer and is only meant to be sent to
    # /auth/refresh) would otherwise decode successfully here too and work
    # as a normal access token for its entire multi-day lifetime.
    to_encode.update({"exp": expire, "jti": uuid4().hex, "type": "access"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Same shape as create_access_token - same secret, same jti-based
    revocability via Revoked_Tokens - but longer-lived and tagged
    "type": "refresh" so it's only accepted at /auth/refresh (see
    dependencies.auth.get_current_user, which rejects anything that isn't
    "type": "access")."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    to_encode.update({"exp": expire, "jti": uuid4().hex, "type": "refresh"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Despite the name, this decodes any token issued by either function
    above - access and refresh tokens share the same secret/algorithm and
    only differ in their "type" claim and expiry. Callers that need to
    tell them apart (get_current_user, refresh_access_token) check
    payload["type"] themselves after calling this."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None
