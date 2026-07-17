"""Email sending via Gmail SMTP.

In DEV mode (no ``SMTP_USER`` / ``SMTP_APP_PASSWORD`` configured) emails are not
sent — they are logged, and callers surface the OTP / reset link in the API
response so local signup and password-reset flows can be exercised without a
real mailbox. Configure the SMTP settings in ``.env`` to send for real.

``smtplib`` is blocking, so the actual send runs in a threadpool to avoid
stalling the event loop.
"""
import logging
import smtplib
from email.message import EmailMessage

from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings

logger = logging.getLogger("cafepos")
settings = get_settings()


def _send_sync(to: str, subject: str, html_body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name} <{settings.email_sender}>"
    msg["To"] = to
    msg.set_content("This email requires an HTML-capable client.")
    msg.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        smtp.starttls()
        smtp.login(settings.smtp_user, settings.smtp_app_password)
        smtp.send_message(msg)


async def send_email(to: str, subject: str, html_body: str) -> None:
    """Send an email, or log it in DEV mode. Never raises to the caller."""
    if not settings.email_configured:
        logger.warning("[DEV EMAIL — not sent] to=%s subject=%s\n%s", to, subject, html_body)
        return
    try:
        await run_in_threadpool(_send_sync, to, subject, html_body)
        logger.info("Email sent to %s (%s)", to, subject)
    except Exception as exc:  # pragma: no cover - network/SMTP failures logged, not fatal
        logger.error("Failed to send email to %s: %s", to, exc)


def otp_email(name: str, otp: str) -> tuple[str, str]:
    subject = "Your Cafe POS verification code"
    body = f"""
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
      <h2>Verify your email</h2>
      <p>Hi {name}, use this code to finish creating your Cafe POS account:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:24px 0">{otp}</p>
      <p style="color:#666">This code expires in {settings.otp_expiry_minutes} minutes.
      If you didn't request it, ignore this email.</p>
    </div>
    """
    return subject, body


def action_otp_email(name: str, otp: str, action: str) -> tuple[str, str]:
    """OTP for confirming a sensitive in-app action (e.g. deleting the menu)."""
    subject = "Your Cafe POS confirmation code"
    body = f"""
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
      <h2>Confirm: {action}</h2>
      <p>Hi {name}, enter this code to confirm <b>{action}</b>:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:24px 0">{otp}</p>
      <p style="color:#b91c1c">This action is permanent. If you didn't request it, ignore
      this email and your data stays untouched.</p>
      <p style="color:#666">This code expires in {settings.otp_expiry_minutes} minutes.</p>
    </div>
    """
    return subject, body


def reset_email(name: str, reset_url: str) -> tuple[str, str]:
    subject = "Reset your Cafe POS password"
    body = f"""
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
      <h2>Password reset</h2>
      <p>Hi {name}, click the button below to set a new password.</p>
      <p style="margin:24px 0">
        <a href="{reset_url}" style="background:#4f46e5;color:#fff;padding:12px 20px;
        border-radius:8px;text-decoration:none;font-weight:600">Reset password</a>
      </p>
      <p style="color:#666">This link expires in {settings.reset_token_expiry_minutes} minutes.
      If you didn't request it, ignore this email.</p>
    </div>
    """
    return subject, body
