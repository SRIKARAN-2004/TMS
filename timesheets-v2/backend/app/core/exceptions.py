"""
Custom application exceptions.

Instead of scattering `raise HTTPException(status_code=..., detail=...)`
across every controller, business logic raises these semantic exceptions
instead. A single handler in main.py converts them to the same JSON shape
FastAPI's HTTPException would produce ({"detail": "..."}), so nothing on
the frontend needs to change - but the backend code reads more clearly and
the status code is decided in one place per error type, not re-typed at
every call site.
"""


class AppException(Exception):
    """Base class for all custom application exceptions."""

    status_code: int = 500

    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


class NotFoundError(AppException):
    """A requested resource (user, project, task, time log...) doesn't exist."""

    status_code = 404

    def __init__(self, resource: str = "Resource"):
        super().__init__(f"{resource} not found")


class InvalidCredentialsError(AppException):
    """Login failed - wrong username/password, or the account is inactive."""

    status_code = 401

    def __init__(self, detail: str = "Invalid username or password"):
        super().__init__(detail)


class PermissionDeniedError(AppException):
    """Authenticated, but not allowed to perform this specific action
    (distinct from role-based route protection, which uses HTTP 403 at the
    dependency layer already - this is for finer-grained checks inside a
    route, e.g. 'you can only edit your own time logs')."""

    status_code = 403

    def __init__(self, detail: str = "You do not have permission to perform this action"):
        super().__init__(detail)


class ConflictError(AppException):
    """The request conflicts with existing data - duplicate userid/username,
    duplicate assignment, etc."""

    status_code = 409

    def __init__(self, detail: str):
        super().__init__(detail)


class BadRequestError(AppException):
    """The request is well-formed but semantically invalid - e.g. an end
    time before a start time."""

    status_code = 400

    def __init__(self, detail: str):
        super().__init__(detail)


class NoRoleAssignedError(AppException):
    """A user authenticated successfully but has no role assigned yet, so
    there's nothing for the frontend to route them to."""

    status_code = 403

    def __init__(self, detail: str = "No role assigned to this account. Contact an administrator."):
        super().__init__(detail)
