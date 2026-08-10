"""Password strength policy - the one place this is defined.

Previously "len(new_password) < 6" was checked ad hoc in two different
controller functions (auth_service.change_password and
user_service.reset_password), independent of each other and of the
schemas that actually receive the password. That meant the two checks
could silently drift (already the change - one used a plain if/raise, the
other something equivalent but copy-pasted), and neither ran until deep
inside a controller, well after Pydantic had already accepted the request
body as valid. Enforcing it here, as a schema-level validator, means
every entry point that accepts a new password (signup, self-service
change, admin reset) gets the same rule for free just by using the
field type, and a weak password is rejected as a clean 422 before any
controller code runs at all.
"""
import re

MIN_LENGTH = 8
_HAS_LETTER = re.compile(r"[A-Za-z]")
_HAS_DIGIT = re.compile(r"\d")


def validate_password_strength(password: str) -> str:
    if len(password) < MIN_LENGTH:
        raise ValueError(f"Password must be at least {MIN_LENGTH} characters")
    if not _HAS_LETTER.search(password):
        raise ValueError("Password must contain at least one letter")
    if not _HAS_DIGIT.search(password):
        raise ValueError("Password must contain at least one number")
    return password
