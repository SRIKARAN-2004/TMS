"""Minimal outbound-email helper, built on stdlib smtplib only (no extra
dependency needed). Two call sites use this:

  - auth_service.request_password_reset  -> the "forgot password" link
  - user_service._insert_user            -> the new-user welcome email
    with login credentials, sent to the personal/company mail entered on
    the New User form

If SMTP isn't configured (see Settings.SMTP_CONFIGURED), send_email logs
the message instead of raising - so local dev and any admin flow that
happens to run before SMTP env vars are set never breaks just because
there's no mail server. In that case the message body (including any
reset link / temporary password) shows up in the backend logs, which is
enough to keep working locally.
"""
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email(*, to: str, subject: str, body: str, html_body: str | None = None) -> bool:
    """Best-effort send. Returns True if the message was actually handed
    to an SMTP server, False if it was only logged (not configured) or a
    send attempt failed. Callers should never let a failed/absent send
    block the underlying action (password reset request, user creation) -
    email delivery is a side effect, not a precondition."""
    if not to:
        logger.warning("mailer: skipping send_email(subject=%r) - no recipient address", subject)
        return False

    if not settings.SMTP_CONFIGURED:
        logger.info(
            "mailer: SMTP not configured, logging instead of sending.\nTo: %s\nSubject: %s\n\n%s",
            to,
            subject,
            body,
        )
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM}>"
    msg["To"] = to
    msg.set_content(body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                if settings.SMTP_USE_TLS:
                    server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
        logger.info("mailer: sent %r to %s", subject, to)
        return True
    except Exception:  # noqa: BLE001 - never let mail delivery break the request
        logger.exception("mailer: failed to send %r to %s", subject, to)
        return False


def send_welcome_email(*, to: str, name: str, username: str, password: str, login_url: str) -> bool:
    subject = "Your Timesheets account has been created"
    body = (
        f"Hi {name},\n\n"
        f"An administrator has created a Timesheets account for you.\n\n"
        f"Login username: {username}\n"
        f"Temporary password: {password}\n\n"
        f"Sign in here: {login_url}\n"
        f"You'll be asked to set your own password the first time you log in.\n\n"
        f"If you weren't expecting this account, you can ignore this email.\n"
    )
    html_body = (
        f"<p>Hi {name},</p>"
        f"<p>An administrator has created a Timesheets account for you.</p>"
        f"<p><b>Login username:</b> {username}<br/>"
        f"<b>Temporary password:</b> {password}</p>"
        f'<p><a href="{login_url}">Sign in to Timesheets</a></p>'
        f"<p>You'll be asked to set your own password the first time you log in.</p>"
        f"<p style='color:#777;font-size:12px'>If you weren't expecting this account, "
        f"you can ignore this email.</p>"
    )
    return send_email(to=to, subject=subject, body=body, html_body=html_body)


def send_password_reset_email(*, to: str, name: str, reset_url: str, expires_minutes: int) -> bool:
    subject = "Reset your Timesheets password"
    body = (
        f"Hi {name},\n\n"
        f"We received a request to reset your Timesheets password.\n\n"
        f"Reset it here (valid for {expires_minutes} minutes): {reset_url}\n\n"
        f"If you didn't request this, you can safely ignore this email - "
        f"your password won't change.\n"
    )
    html_body = (
        f"<p>Hi {name},</p>"
        f"<p>We received a request to reset your Timesheets password.</p>"
        f'<p><a href="{reset_url}">Reset your password</a> '
        f"(valid for {expires_minutes} minutes)</p>"
        f"<p style='color:#777;font-size:12px'>If you didn't request this, you can "
        f"safely ignore this email - your password won't change.</p>"
    )
    return send_email(to=to, subject=subject, body=body, html_body=html_body)
