import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.security import decode_access_token
from app.db.session import get_db
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    CurrentUser,
    ForgotPasswordRequest,
    ResetPasswordConfirm,
)
from app.controllers.auth_service import (
    authenticate_and_login,
    refresh_access_token,
    request_password_reset,
    confirm_password_reset,
)
from app.dependencies.auth import get_current_user, get_user_roles, COOKIE_NAME, REFRESH_COOKIE_NAME
from app.models.user import User, Password
from app.models.revoked_token import RevokedToken

router = APIRouter(prefix="/auth", tags=["Auth"])
ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"

CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
# Cookie lifetimes are derived from the token lifetimes in settings rather
# than hardcoded separately, so the cookie and the JWT it carries can never
# drift out of sync with each other.
ACCESS_COOKIE_MAX_AGE = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
REFRESH_COOKIE_MAX_AGE = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60


def _set_access_cookie(response: Response, access_token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=ACCESS_COOKIE_MAX_AGE,
        path="/",
    )


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=REFRESH_COOKIE_MAX_AGE,
        # Scoped to /auth (not "/") - this token is only ever meant to be
        # sent to /auth/refresh or /auth/logout, not attached to every
        # ordinary API request the way the access token cookie is. Keeps
        # a long-lived, high-value credential out of requests that never
        # need it.
        path="/auth",
    )


def _set_csrf_cookie(response: Response) -> None:
    # Double-submit CSRF cookie: deliberately NOT httpOnly, since the
    # frontend has to read it and echo it back as a header on every
    # mutating request (see api/client.ts). A cross-site form or fetch can
    # still make the browser attach the access_token cookie automatically,
    # but it has no way to read this cookie's value to also set the header
    # (browsers don't let a page on evil.example read cookies scoped to
    # this app's origin), so the request gets rejected by the middleware
    # in main.py.
    #
    # Its lifetime matches the refresh token, not the access token: it
    # needs to still be around whenever /auth/refresh is called (which is
    # precisely when the access token has already expired), not just
    # during the short access-token window.
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=secrets.token_urlsafe(32),
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=REFRESH_COOKIE_MAX_AGE,
        path="/",
    )


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    _set_access_cookie(response, access_token)
    _set_refresh_cookie(response, refresh_token)
    _set_csrf_cookie(response)


def _revoke_token_if_present(db: Session, token: str | None) -> None:
    """Shared by logout and refresh (rotation): decodes a token and, if it
    has a jti/exp, adds it to Revoked_Tokens so it stops working
    immediately even though it hasn't naturally expired yet. Silently a
    no-op for a missing/already-invalid token - both callers are fine with
    "nothing to revoke" being a non-error."""
    if not token:
        return
    payload = decode_access_token(token)
    if not payload:
        return
    jti = payload.get("jti")
    exp = payload.get("exp")
    if jti and exp:
        expires_at = datetime.fromtimestamp(exp, tz=timezone.utc).replace(tzinfo=None)
        if not db.query(RevokedToken).filter(RevokedToken.jti == jti).first():
            db.add(RevokedToken(jti=jti, expires_at=expires_at))


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """Public endpoint. Verifies credentials against the Passwords table and
    issues a JWT. The token is set as an httpOnly cookie (so browser JS can
    never read it - protects against XSS token theft) and the browser sends
    it back automatically on every request. The raw token is deliberately
    NOT included in the JSON body - see LoginResponse's docstring.

    Rate-limited to 5 attempts/minute per IP - previously unlimited, which
    let an attacker brute-force a known username's password with no
    slowdown or lockout."""
    result = authenticate_and_login(db, payload.username, payload.password)
    _set_auth_cookies(response, result["access_token"], result["refresh_token"])
    return result


@router.post("/refresh")
@limiter.limit("30/minute")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    """Public endpoint (no get_current_user dependency - the whole point is
    to be callable with an *expired* access token). Trades a still-valid
    refresh_token cookie for a new access token, and rotates the refresh
    token itself in the same step (see auth_service.refresh_access_token).
    The frontend calls this automatically the first time any API request
    comes back 401 (see api/client.ts), so a session lasts as long as the
    refresh token does (REFRESH_TOKEN_EXPIRE_DAYS) rather than only as long
    as the short-lived access token (ACCESS_TOKEN_EXPIRE_MINUTES), without
    ever putting a long-lived token in front of every ordinary request."""
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Your session has expired. Please log in again.")
    result = refresh_access_token(db, token)
    _set_access_cookie(response, result["access_token"])
    _set_refresh_cookie(response, result["refresh_token"])
    _set_csrf_cookie(response)
    return {"status": "refreshed"}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """Clears every auth cookie server-side, and revokes both the access
    and refresh token's jti (if either was still valid) so neither keeps
    working even if a copy exists elsewhere (see RevokedToken and
    dependencies.auth.get_current_user / auth_service.refresh_access_token
    for the two places a revoked jti is checked). Logout is intentionally
    tolerant of already-invalid/expired/missing tokens: there's nothing to
    revoke in that case, but clearing cookies should still succeed."""
    _revoke_token_if_present(db, request.cookies.get(COOKIE_NAME))
    _revoke_token_if_present(db, request.cookies.get(REFRESH_COOKIE_NAME))
    # Opportunistic cleanup: rows for tokens that have already naturally
    # expired are useless (an expired token is rejected on the exp check
    # alone) and would otherwise accumulate forever.
    db.query(RevokedToken).filter(RevokedToken.expires_at < datetime.utcnow()).delete()
    db.commit()

    response.delete_cookie(key=COOKIE_NAME, path="/")
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/auth")
    response.delete_cookie(key=CSRF_COOKIE_NAME, path="/")
    return {"status": "logged out"}


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Public endpoint, step 1 of self-service password reset - works for
    every role (admin/manager/employee). Accepts a login username or the
    email on file. Always returns the same generic message (see
    auth_service.request_password_reset) so it can't be used to enumerate
    accounts. Rate-limited for the same brute-force/enumeration reasons as
    /login."""
    return request_password_reset(db, payload.identifier)


@router.post("/reset-password")
@limiter.limit("10/minute")
def reset_password(payload: ResetPasswordConfirm, request: Request, db: Session = Depends(get_db)):
    """Public endpoint, step 2 - consumes the token from the emailed link
    along with a new password + confirmation (match already validated at
    the schema layer) and sets it. Works identically for every role."""
    return confirm_password_reset(db, payload.token, payload.new_password)


@router.get("/me", response_model=CurrentUser)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Protected endpoint - requires a valid session cookie. The frontend
    calls this on every app load to restore the session, since it no longer
    keeps the token anywhere JS-accessible."""
    roles = get_user_roles(current_user, db)
    pw_row = db.query(Password).filter(Password.user_id == current_user.id).first()
    return CurrentUser(
        id=current_user.id,
        userid=current_user.userid,
        name=current_user.name,
        company_mail=current_user.company_mail,
        roles=roles,
        must_change_password=bool(pw_row.must_change_password) if pw_row else False,
    )
