from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User
from app.models.revoked_token import RevokedToken
from app.repositories import user_repository

COOKIE_NAME = "access_token"
# Only ever read/written by /auth/login, /auth/refresh, /auth/logout - see
# auth_routes.py, where its cookie is scoped to path="/auth" specifically
# so it isn't attached to every other API request the way the access
# token cookie is.
REFRESH_COOKIE_NAME = "refresh_token"

# auto_error=False so a missing Authorization header doesn't 401 by itself -
# we still fall back to checking the cookie before rejecting the request.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def _extract_token(request: Request, header_token: str | None) -> str | None:
    """The browser app authenticates via an httpOnly cookie (set on login),
    so that's checked first. The Authorization header is kept as a fallback
    purely so /docs' 'Authorize' button and direct API/curl testing still
    work without needing to fake a cookie."""
    cookie_token = request.cookies.get(COOKIE_NAME)
    if cookie_token:
        return cookie_token
    return header_token


def get_current_user(
    request: Request,
    header_token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Decodes the JWT and loads the user. Raises 401 if invalid/expired.
    This is what makes every route that depends on it a 'protected route'."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = _extract_token(request, header_token)
    if not token:
        raise credentials_exception

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    # A refresh token is a valid, correctly-signed JWT too - without this
    # check it would otherwise pass every test below and work as a normal
    # access token for its full multi-day lifetime, defeating the point of
    # keeping access tokens short-lived. Only /auth/refresh accepts
    # "type": "refresh" (see auth_service.refresh_access_token).
    if payload.get("type") != "access":
        raise credentials_exception

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    # A logged-out token is otherwise a perfectly valid, unexpired JWT - the
    # signature and exp checks above pass on their own. This is the other
    # half of revocation (see security.create_access_token's jti and
    # auth_routes.logout): a token whose jti shows up here as revoked is
    # rejected even though it hasn't naturally expired yet.
    jti = payload.get("jti")
    if jti and db.query(RevokedToken).filter(RevokedToken.jti == jti).first():
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.isAlive:
        raise credentials_exception

    # Stashed for routes that need to revoke *this* token (logout) without
    # re-decoding it.
    request.state.token_payload = payload

    return user


def get_user_roles(user: User, db: Session) -> list[str]:
    return user_repository.get_roles_for_user(db, user.id)


def require_roles(*allowed_roles: str):
    """Dependency factory for role-protected routes.
    Usage: Depends(require_roles('admin')) or Depends(require_roles('admin', 'manager'))
    """

    def dependency(
        current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
    ) -> User:
        roles = get_user_roles(current_user, db)
        if not any(r in allowed_roles for r in roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource",
            )
        current_user._roles = roles  # stash for handlers that need it
        return current_user

    return dependency
