import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Values that must never be used as real secrets - if the env var is unset
# and falls back to one of these, the app is not safe to run in production.
_INSECURE_JWT_DEFAULTS = {"", "CHANGE_THIS_SECRET_IN_PRODUCTION"}


class Settings:
    # --- Environment ---
    # Defaults to "development" so local setups (no .env yet, or a minimal
    # one) keep working out of the box. Anything else is treated as
    # production for the purposes of the fail-closed checks below - set
    # ENVIRONMENT=production explicitly when deploying.
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    IS_PRODUCTION: bool = ENVIRONMENT.lower() == "production"

    # --- Database ---
    # No hardcoded fallback password - a real credential ("srikaran") was
    # previously committed here as a "default", which is indistinguishable
    # from a live secret sitting in git history. Local dev must set
    # DB_PASSWORD in backend/.env (see .env.example) like every other value.
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: str = os.getenv("DB_PORT", "3306")
    DB_USER: str = os.getenv("DB_USER", "root")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")
    DB_NAME: str = os.getenv("DB_NAME", "timesheets_v2")

    SQLALCHEMY_DATABASE_URL: str = (
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )

    # --- JWT / Auth ---
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "")
    JWT_ALGORITHM: str = "HS256"
    # Short-lived by design: this is the token attached to every request,
    # so a stolen copy (XSS, a proxy log, a shared machine) is only useful
    # for a narrow window. Session length beyond this comes from the
    # refresh token below, not from making the access token itself long-
    # lived.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    # Long-lived, but only ever sent to /auth/refresh - never attached to
    # normal API requests - and rotated on every use (see
    # auth_service.refresh_access_token): each refresh both issues a new
    # refresh token AND revokes the one that was just used, so a stolen
    # refresh token only works until its next legitimate use, not for its
    # full remaining lifetime.
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "1"))

    # Cookies must be marked Secure in production (HTTPS only) so the auth
    # cookie is never sent over plain HTTP. This now defaults to True
    # (fail-closed) instead of False (fail-open) - local dev over plain
    # http needs to explicitly opt out via COOKIE_SECURE=false in .env.
    COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "true").lower() == "true"

    # --- CORS ---
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
    # Comma-separated list of additional allowed origins (e.g. a staging
    # domain). FRONTEND_ORIGIN above is always included; the two
    # hardcoded localhost origins are only added in development (see
    # ALLOWED_ORIGINS property below) - previously they were included
    # unconditionally regardless of ENVIRONMENT, meaning a production
    # deployment's CORS policy still trusted http://localhost:5173 as an
    # allowed origin for no reason.
    _EXTRA_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "")

    @property
    def ALLOWED_ORIGINS(self) -> list[str]:
        origins = [self.FRONTEND_ORIGIN]
        origins += [o.strip() for o in self._EXTRA_ORIGINS.split(",") if o.strip()]
        if not self.IS_PRODUCTION:
            origins += ["http://localhost:5173", "http://127.0.0.1:5173"]
        # De-duplicate while preserving order.
        return list(dict.fromkeys(origins))

    # --- Outbound email (SMTP) ---
    # Used for two things: (1) the "forgot password" reset-link email, and
    # (2) the welcome email an admin-created user gets with their login
    # credentials. Left unset in local dev is fine - app/core/mailer.py
    # falls back to logging the message instead of sending it, so nothing
    # about auth or user creation breaks just because SMTP isn't
    # configured yet. Set all of SMTP_HOST/SMTP_USER/SMTP_PASSWORD to
    # actually send real emails.
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "") or SMTP_USER
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "Timesheets")
    # STARTTLS on 587 (the common case) vs. implicit TLS on 465.
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() == "true"

    @property
    def SMTP_CONFIGURED(self) -> bool:
        return bool(self.SMTP_HOST and self.SMTP_USER and self.SMTP_PASSWORD)

    # Minutes a "forgot password" reset link/token stays valid for.
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", "30")
    )


settings = Settings()


def _fail_startup(message: str) -> None:
    """Both DB_PASSWORD and JWT_SECRET_KEY previously had real-looking
    fallback values, so a misconfigured/forgotten .env in production would
    silently start up with a guessable password and a secret anyone could
    read from this file to forge JWTs for any user id. Missing/placeholder
    values now hard-fail at import time (before the app can accept any
    traffic) instead of degrading silently."""
    print(f"FATAL: {message}", file=sys.stderr)
    raise RuntimeError(message)


if not settings.DB_PASSWORD:
    _fail_startup(
        "DB_PASSWORD is not set. Set it in backend/.env (see .env.example) - "
        "there is no default credential anymore."
    )

if not settings.JWT_SECRET_KEY or settings.JWT_SECRET_KEY in _INSECURE_JWT_DEFAULTS:
    _fail_startup(
        "JWT_SECRET_KEY is not set (or is still the placeholder value). "
        "Generate a long random string (e.g. `python -c \"import secrets; "
        "print(secrets.token_urlsafe(64))\"`) and set it in backend/.env - "
        "anyone who knows this value can forge a valid login token for any "
        "user id."
    )
