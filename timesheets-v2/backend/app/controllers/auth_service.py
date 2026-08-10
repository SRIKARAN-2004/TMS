import hashlib
import logging
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.mailer import send_password_reset_email
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    hash_password,
)
from app.core.exceptions import (
    InvalidCredentialsError,
    NoRoleAssignedError,
    BadRequestError,
)
from app.dependencies.auth import get_user_roles
from app.models.user import User
from app.models.revoked_token import RevokedToken
from app.repositories import user_repository

logger = logging.getLogger(__name__)

# A bcrypt hash of an arbitrary, fixed dummy password - never used as a
# real credential for anyone. Its only purpose is to give verify_password()
# something to do the same amount of work against when the username
# doesn't exist at all (see the timing note in authenticate_and_login).
_DUMMY_HASH = hash_password("this-is-not-a-real-password-just-a-timing-decoy")


def authenticate_and_login(db: Session, username: str, password: str) -> dict:
    pw_row = user_repository.get_password_by_username(db, username)

    # Previously this was `if not pw_row or not verify_password(...)`,
    # which short-circuits: verify_password (a deliberately slow bcrypt
    # comparison) only ran when the username existed. That made an
    # unknown username's response come back measurably faster than a
    # known username with a wrong password - a timing side-channel an
    # attacker can use to enumerate valid usernames without ever needing
    # a correct password. Running verify_password unconditionally (against
    # a real hash when the user exists, a dummy one otherwise) means both
    # cases do the same bcrypt work, so the response time no longer leaks
    # whether the username was valid.
    hash_to_check = pw_row.password if pw_row else _DUMMY_HASH
    password_ok = verify_password(password, hash_to_check)

    if not pw_row or not password_ok:
        # Deliberately doesn't distinguish "unknown username" from "wrong
        # password" in the log message either, for the same reason - only
        # that *an* attempt failed, and for which username it was tried
        # against (useful for spotting brute-force/enumeration patterns in
        # app.log without adding to the enumeration surface itself).
        logger.warning("Failed login attempt for username=%s", username)
        raise InvalidCredentialsError()

    user = user_repository.get_by_id(db, pw_row.user_id)
    if not user or not user.isAlive:
        logger.warning("Login attempt for inactive/missing account, user_id=%s", pw_row.user_id)
        raise InvalidCredentialsError("This account is inactive")

    roles = get_user_roles(user, db)
    if not roles:
        logger.warning("Login blocked - no role assigned, user_id=%s", user.id)
        raise NoRoleAssignedError()

    token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    logger.info("User %s (id=%s) logged in", user.userid, user.id)

    return {
        "access_token": token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user_id": user.id,
        "userid": user.userid,
        "name": user.name,
        "roles": roles,
        "must_change_password": bool(pw_row.must_change_password),
    }


def refresh_access_token(db: Session, refresh_token: str) -> dict:
    """Step of the refresh flow (see /auth/refresh): trades a still-valid
    refresh token for a brand new access token. The refresh token itself
    is rotated in the same step - the one just used is immediately
    revoked (added to Revoked_Tokens, same mechanism as logout) and a new
    one is issued - so a copy of a refresh token intercepted in transit is
    only ever usable once, not for its full remaining day-long lifetime.

    Deliberately does not check get_current_user/roles the way a normal
    protected route would: the whole point of this endpoint is to be
    reachable with an *expired* access token, as long as the refresh token
    is still good.
    """
    payload = decode_access_token(refresh_token)
    # 401, not 403: this means "not authenticated" (no valid session to
    # act on), the same status get_current_user already uses for a bad
    # access token - not "authenticated but not allowed to do this",
    # which is what 403/PermissionDeniedError means elsewhere in this
    # file. The frontend's 401 handling (see api/client.ts) is what a
    # failed refresh needs to trigger: bounce to /login.
    invalid = InvalidCredentialsError("Your session has expired. Please log in again.")

    if payload is None or payload.get("type") != "refresh":
        raise invalid

    jti = payload.get("jti")
    if jti and db.query(RevokedToken).filter(RevokedToken.jti == jti).first():
        raise invalid

    user_id = payload.get("sub")
    if user_id is None:
        raise invalid

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.isAlive:
        raise invalid

    exp = payload.get("exp")
    if jti and exp:
        db.add(RevokedToken(jti=jti, expires_at=datetime.utcfromtimestamp(exp)))
        db.commit()

    return {
        "access_token": create_access_token(data={"sub": str(user.id)}),
        "refresh_token": create_refresh_token(data={"sub": str(user.id)}),
    }


def change_password(db: Session, user_id: int, current_password: str, new_password: str) -> dict:
    """Self-service password change - requires the current password as
    proof of identity, works for any role (admin/manager/employee all use
    the same flow). Strength is enforced at the schema layer
    (ChangePasswordRequest), not here - see schemas/password_policy.py."""
    pw_row = user_repository.get_password_by_user_id(db, user_id)
    if not pw_row or not verify_password(current_password, pw_row.password):
        raise InvalidCredentialsError("Current password is incorrect")

    pw_row.password = hash_password(new_password)
    pw_row.must_change_password = False
    user_repository.save(db)
    return {"status": "password changed"}


_GENERIC_FORGOT_PASSWORD_RESPONSE = {
    "status": "ok",
    "message": (
        "If an account matches, we've emailed instructions to reset the password."
    ),
}


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def request_password_reset(db: Session, identifier: str) -> dict:
    """Step 1 of the self-service 'forgot password' flow, for any role.
    `identifier` can be either the login username or the email on file.
    Always returns the same generic response, and always takes roughly
    the same path, whether or not a matching/active account was found -
    an attacker probing this endpoint learns nothing about which
    usernames/emails exist. When a match IS found, a single-use, 30-minute
    token is generated (only its hash is stored - see
    PasswordResetToken) and emailed as a link the frontend's
    /reset-password page can consume."""
    identifier = (identifier or "").strip()
    if not identifier:
        return _GENERIC_FORGOT_PASSWORD_RESPONSE

    pw_row = user_repository.get_password_by_username(db, identifier)
    user = user_repository.get_by_id(db, pw_row.user_id) if pw_row else None
    if not user:
        user = user_repository.get_by_company_mail(db, identifier)

    if not user or not user.isAlive or not user.company_mail:
        logger.info("Password reset requested for unknown/ineligible identifier=%s", identifier)
        return _GENERIC_FORGOT_PASSWORD_RESPONSE

    raw_token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
    user_repository.create_reset_token(
        db, user_id=user.id, token_hash=_hash_token(raw_token), expires_at=expires_at
    )
    user_repository.save(db)

    reset_url = f"{settings.FRONTEND_ORIGIN}/reset-password?token={raw_token}"
    send_password_reset_email(
        to=user.company_mail,
        name=user.name,
        reset_url=reset_url,
        expires_minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES,
    )
    logger.info("Password reset email issued for user_id=%s", user.id)
    return _GENERIC_FORGOT_PASSWORD_RESPONSE


def confirm_password_reset(db: Session, token: str, new_password: str) -> dict:
    """Step 2: consumes the token from the emailed link and sets the new
    password. Works identically for admin/manager/employee accounts -
    there's nothing role-specific about resetting your own password.
    Strength/confirmation-match is already enforced at the schema layer
    (ResetPasswordConfirm)."""
    token_row = user_repository.get_reset_token_by_hash(db, _hash_token(token))
    if not token_row or token_row.used or token_row.expires_at < datetime.utcnow():
        raise BadRequestError("This reset link is invalid or has expired. Please request a new one.")

    pw_row = user_repository.get_password_by_user_id(db, token_row.user_id)
    if not pw_row:
        raise BadRequestError("This reset link is invalid or has expired. Please request a new one.")

    pw_row.password = hash_password(new_password)
    pw_row.must_change_password = False
    token_row.used = True
    user_repository.save(db)
    logger.info("Password reset completed for user_id=%s", token_row.user_id)
    return {"status": "password reset"}
