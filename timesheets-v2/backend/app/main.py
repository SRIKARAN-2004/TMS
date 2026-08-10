import logging
import hmac

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.exceptions import AppException
from app.core.logging_config import setup_logging
from app.core.rate_limit import limiter
from app.db.session import Base, engine
from app import models  # noqa: F401 - registers all models on Base metadata
from app.routes import auth_routes, admin_routes, manager_routes, employee_routes
from app.routes.auth_routes import COOKIE_NAME as AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_HEADER_NAME
from app.dependencies.auth import REFRESH_COOKIE_NAME

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title="Timesheet Tracking Application API", version="1.0.0")

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", CSRF_HEADER_NAME],
)

_CSRF_EXEMPT_METHODS = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def csrf_protection(request: Request, call_next):
    """Double-submit CSRF check for cookie-authenticated, state-changing
    requests. There was previously no CSRF defense at all - the frontend's
    axios client sends withCredentials: true with nothing to prove the
    request actually originated from the app's own pages, leaving
    everything resting on the cookie's SameSite=Lax setting alone (not
    something the frontend can verify or enforce, and not airtight against
    every cross-site-request scenario on its own).

    Only requests that are (a) mutating and (b) authenticated via a cookie
    are checked - a request using the Authorization header instead (e.g.
    /docs, curl, a non-browser API client) isn't subject to CSRF in the
    first place, since a third-party site can't make the browser attach an
    arbitrary header the way it can a cookie.

    Checks for the refresh token cookie too, not just the access token
    one: /auth/refresh is a mutating endpoint that's specifically meant to
    still work once the access token cookie has already expired and been
    dropped by the browser, so gating this check on AUTH_COOKIE_NAME alone
    would leave exactly that request unprotected."""
    has_auth_cookie = AUTH_COOKIE_NAME in request.cookies or REFRESH_COOKIE_NAME in request.cookies
    if request.method not in _CSRF_EXEMPT_METHODS and has_auth_cookie:
        csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)
        csrf_header = request.headers.get(CSRF_HEADER_NAME)
        if not csrf_cookie or not csrf_header or not hmac.compare_digest(csrf_cookie, csrf_header):
            return JSONResponse(status_code=403, content={"detail": "Missing or invalid CSRF token"})
    return await call_next(request)


@app.exception_handler(AppException)
def app_exception_handler(request: Request, exc: AppException):
    """Converts any custom exception raised from business logic into the
    same {"detail": "..."} JSON shape FastAPI's own HTTPException produces,
    using the status_code defined on the exception class. This keeps every
    error response consistent without repeating status codes at every
    raise site in the controllers."""
    logger.warning(
        "%s %s -> %s %s", request.method, request.url.path, exc.status_code, exc.detail
    )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(SQLAlchemyError)
def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    """Safety net: previously there was no handler for SQLAlchemyError at
    all, so a value that slipped past Pydantic validation but violated a DB
    constraint (e.g. an ENUM column) surfaced as a raw, unhandled 500 with a
    stack trace instead of a clean JSON error. This is a backstop, not a
    substitute for validating input at the schema layer. The get_db
    dependency's `finally: db.close()` still runs as this propagates, and
    Session.close() rolls back any pending transaction on its way out, so
    no explicit rollback is needed here."""
    # logger.exception() relies on sys.exc_info(), which is not reliably
    # populated here - FastAPI/Starlette invokes exception handlers
    # outside the original `except` frame (e.g. via run_in_threadpool for
    # a sync handler), so exc_info() can already be cleared by the time
    # this runs, silently logging "NoneType: None" instead of the real
    # traceback. Passing `exc` explicitly guarantees the actual exception
    # and traceback get logged regardless of how this handler was invoked.
    logger.error(
        "%s %s -> unhandled database error: %s", request.method, request.url.path, exc, exc_info=exc
    )
    return JSONResponse(status_code=500, content={"detail": "A database error occurred. Please try again."})


@app.exception_handler(RateLimitExceeded)
def rate_limit_exception_handler(request: Request, exc: RateLimitExceeded):
    logger.warning("%s %s -> rate limit exceeded", request.method, request.url.path)
    return JSONResponse(status_code=429, content={"detail": "Too many attempts. Please wait a moment and try again."})


app.include_router(auth_routes.router)
app.include_router(admin_routes.router)
app.include_router(manager_routes.router)
app.include_router(employee_routes.router)


@app.on_event("startup")
def on_startup():
    # Creates any tables that don't exist yet. Your schema is already defined
    # via the SQL you shared - this is a safety net for the exact same shape.
    Base.metadata.create_all(bind=engine)
    logger.info("Timesheet Tracking Application API started up successfully.")


@app.get("/")
def root():
    return {"status": "ok", "service": "Timesheet Tracking Application API"}


@app.get("/health")
def health():
    return {"status": "healthy"}
