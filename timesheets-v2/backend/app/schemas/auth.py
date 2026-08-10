from pydantic import BaseModel, field_validator
from typing import List

from app.schemas.password_policy import validate_password_strength


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    """Deliberately does NOT include the raw JWT. The token is set as an
    httpOnly cookie (see auth_routes._set_auth_cookies) specifically so
    page JS can never read it - returning it here too, in a response body
    that JS *can* read (via fetch/axios), would silently defeat that
    protection for anyone with an XSS foothold on the page."""
    user_id: int
    userid: str
    name: str
    roles: List[str]
    # Set on the seeded admin account (and by admin resets, if ever
    # desired) so the frontend can force a password change before letting
    # the user do anything else. See seed_db.py.
    must_change_password: bool = False


class CurrentUser(BaseModel):
    id: int
    userid: str
    name: str
    company_mail: str | None = None
    roles: List[str] = []
    must_change_password: bool = False


class ChangePasswordRequest(BaseModel):
    """Self-service - the logged-in user changes their own password. Requires
    the current password as proof, unlike the admin reset below."""
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v):
        return validate_password_strength(v)


class ResetPasswordRequest(BaseModel):
    """Admin-only - sets a user's password directly without knowing the old
    one. Handy alongside the self-service "forgot password" flow below for
    cases where an admin wants to set someone's password themselves (e.g.
    the person has no working email on file)."""
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v):
        return validate_password_strength(v)


class ForgotPasswordRequest(BaseModel):
    """Self-service - works identically for admin/manager/employee. Accepts
    either the person's login username or the email on file for their
    account. The response is identical whether or not a match was found
    (see auth_service.request_password_reset), so this endpoint can't be
    used to enumerate valid usernames/emails."""
    identifier: str


class ResetPasswordConfirm(BaseModel):
    """Second step of the self-service flow: the token from the emailed
    link, plus a new password and its confirmation. Confirmation is
    checked here (schema layer) so a mismatch is a clean 422 before any
    controller code runs, mirroring how strength is enforced."""
    token: str
    new_password: str
    confirm_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v):
        return validate_password_strength(v)

    @field_validator("confirm_password")
    @classmethod
    def validate_confirm_password(cls, v, info):
        new_password = info.data.get("new_password")
        if new_password is not None and v != new_password:
            raise ValueError("New password and confirmation do not match")
        return v
