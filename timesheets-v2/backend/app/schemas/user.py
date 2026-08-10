import re

from pydantic import BaseModel, field_validator
from typing import Optional, List

from app.schemas.password_policy import validate_password_strength
from app.core.roles import Roles

# Exactly a 10-digit phone number, optionally prefixed with a leading +
# and a 1-3 digit country code (e.g. "9876543210" or "+919876543210").
# Kept intentionally simple (not full E.164) since this is an internal
# company directory field, not a billing/SMS integration.
# Previously this was r"^\+?\d{7,15}$", which accepted anywhere from 7 to
# 15 bare digits - so an (invalid) 11-digit number with no country code
# was silently accepted right alongside a valid 10-digit one. This
# enforces the actual rule: the local number itself must be exactly 10
# digits, with only an optional country code allowed in front of it.
PHONE_PATTERN = re.compile(r"^(\+\d{1,3})?\d{10}$")

# Standard-enough email shape check - not a full RFC 5322 parser (nothing
# is), just enough to catch obvious typos like missing '@' or domain.
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_phone(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return value
    cleaned = value.replace(" ", "").replace("-", "")
    if not PHONE_PATTERN.match(cleaned):
        raise ValueError("Phone number must be exactly 10 digits, optionally prefixed with '+' and a country code")
    return cleaned


def _validate_email(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return value
    cleaned = value.strip()
    if not EMAIL_PATTERN.match(cleaned):
        raise ValueError("Enter a valid email address (e.g. name@company.com)")
    return cleaned


class UserBase(BaseModel):
    """Shared fields only - deliberately carries NO phone/email validators.
    UserOut (below) also builds on this, and a response schema must never
    reject data that's already sitting in the database: a phone number
    that predates this stricter pattern (or that came in through a bulk
    import, a direct DB edit, old seed data, etc.) still has to be
    readable, or the one bad row breaks the *entire* user list for every
    admin, every time. Validation belongs on the way in
    (UserCreate/UserUpdate/UserImportRow), not on the way out."""
    userid: str
    name: str
    company_mail: Optional[str] = None
    phone_number: Optional[str] = None


class _ValidatedContactMixin(BaseModel):
    """Adds the phone/email format checks - mixed into the write-path
    schemas (UserCreate, UserUpdate, UserImportRow) only. Kept separate
    from UserBase so UserOut can share the same field shape without
    inheriting validation that would reject already-stored data on read."""

    @field_validator("phone_number", check_fields=False)
    @classmethod
    def validate_phone_number(cls, v):
        return _validate_phone(v)

    @field_validator("company_mail", check_fields=False)
    @classmethod
    def validate_company_mail(cls, v):
        return _validate_email(v)


class UserCreate(_ValidatedContactMixin, UserBase):
    username: str
    password: str
    role: str  # single role only - admin, manager, or employee, not a list

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        return validate_password_strength(v)


class UserImportRow(_ValidatedContactMixin, UserBase):
    """One row of a bulk user-import spreadsheet. Same required shape as
    UserCreate (userid/name/username/password/role), except password is
    typed as Optional here because the row-level import logic fills in a
    generated one before this model is ever constructed - by the time
    this validates, `password` is always a string, just possibly a
    generated one rather than one typed into the sheet."""
    username: str
    password: str
    role: str

    @field_validator("userid", "name", "username")
    @classmethod
    def validate_required_text(cls, v, info):
        if not str(v or "").strip():
            raise ValueError(f"{info.field_name} is required")
        return v.strip()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        return validate_password_strength(v)

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        cleaned = str(v or "").strip().lower()
        if cleaned not in Roles.ALL:
            raise ValueError(f"role must be one of {', '.join(Roles.ALL)}")
        return cleaned


class UserUpdate(_ValidatedContactMixin, BaseModel):
    name: Optional[str] = None
    company_mail: Optional[str] = None
    phone_number: Optional[str] = None
    isAlive: Optional[bool] = None
    role: Optional[str] = None  # single role only, replaces any existing role


class UserOut(UserBase):
    id: int
    isAlive: bool
    roles: List[str] = []  # will only ever contain 0 or 1 entries now, kept as a
    # list purely so existing frontend code (user.roles.includes(...)) keeps working
    manager_id: Optional[int] = None
    manager_name: Optional[str] = None
    username: Optional[str] = None

    class Config:
        from_attributes = True


class UserImportRowResult(BaseModel):
    row: int
    userid: Optional[str] = None
    status: str  # "created" | "error"
    message: str


class UserImportSummary(BaseModel):
    created: int
    failed: int
    results: List[UserImportRowResult]


class RoleOut(BaseModel):
    id: int
    role: str

    class Config:
        from_attributes = True
