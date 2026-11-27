"""First-login OTP issuing, shared by the login flow and staff invites.

A staff invite (Slice 5) *is* that user's first-login trigger, so it reuses
exactly the same action_otps record the login flow uses rather than a
parallel one.
"""
from datetime import timedelta

from app.core.config import get_settings
from app.core.email import otp_email, send_email
from app.core.security import generate_otp, get_password_hash
from app.models.common import utcnow

settings = get_settings()
FIRST_LOGIN = "first_login"


async def send_first_login_otp(db, user: dict) -> str | None:
    """Generate + email a first-login OTP for `user`, replacing any outstanding
    one. Returns the raw OTP in DEV mode (no SMTP configured) so the caller can
    surface it as dev_otp; returns None once real email is configured."""
    otp = generate_otp()
    await db.action_otps.replace_one(
        {"user_id": user["id"], "purpose": FIRST_LOGIN},
        {
            "user_id": user["id"],
            "cafe_id": user.get("cafe_id"),
            "purpose": FIRST_LOGIN,
            "otp_hash": get_password_hash(otp),
            "attempts": 0,
            "expires_at": utcnow() + timedelta(minutes=settings.otp_expiry_minutes),
        },
        upsert=True,
    )
    subject, body = otp_email(user.get("name", "there"), otp)
    await send_email(user["email"], subject, body)
    return otp if not settings.email_configured else None
