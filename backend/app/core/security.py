"""Password/PIN hashing and JWT creation/verification.

Two token types are issued: short-lived ``access`` tokens and long-lived
``refresh`` tokens. Every token carries a ``type`` claim so a refresh token can
never be used where an access token is expected (and vice versa).
"""
import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet
from fastapi import HTTPException
from passlib.context import CryptContext

from app.core.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _fernet() -> Fernet:
    """Fernet cipher for reversible staff-password storage. Uses the configured
    key, or derives a stable one from jwt_secret so no extra config is needed."""
    key = settings.credential_enc_key.strip()
    if not key:
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.jwt_secret.encode()).digest()).decode()
    return Fernet(key)


def encrypt_secret(plain: str) -> str:
    """Encrypt a recoverable secret (staff password) for at-rest storage."""
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_secret(token: str) -> str:
    """Decrypt a value produced by encrypt_secret."""
    return _fernet().decrypt(token.encode()).decode()


def get_password_hash(secret: str) -> str:
    return pwd_context.hash(secret)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def generate_otp() -> str:
    """A 6-digit numeric one-time code."""
    return f"{secrets.randbelow(1_000_000):06d}"


def generate_reset_token() -> str:
    """A URL-safe opaque token for password-reset links."""
    return secrets.token_urlsafe(32)


_DEVICE_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def generate_device_code() -> str:
    """A 12-char device-pairing code grouped as XXXX-XXXX-XXXX (e.g. ABFW-68JB-OPZR)."""
    raw = "".join(secrets.choice(_DEVICE_CODE_ALPHABET) for _ in range(12))
    return f"{raw[0:4]}-{raw[4:8]}-{raw[8:12]}"


def normalize_device_code(code: str) -> str:
    """Strip separators/whitespace and uppercase, for lookup + comparison."""
    return "".join(ch for ch in (code or "") if ch.isalnum()).upper()


def is_expired(expires_at: datetime) -> bool:
    """Compare safely: Mongo returns naive UTC datetimes, our clock is tz-aware."""
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at < datetime.now(timezone.utc)


def hash_token(token: str) -> str:
    """Deterministic hash for high-entropy reset tokens so they are queryable.

    (bcrypt is used for the low-entropy OTP, which is looked up by email; the
    reset token is looked up directly, so it needs a deterministic digest.)
    """
    return hashlib.sha256(token.encode()).hexdigest()


def _create_token(claims: dict, expires_in: timedelta, token_type: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {**claims, "type": token_type, "iat": now, "exp": now + expires_in}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str, cafe_id: str, role: str) -> str:
    return _create_token(
        {"user_id": user_id, "cafe_id": cafe_id, "role": role},
        timedelta(hours=settings.jwt_expiry_hours),
        "access",
    )


def create_refresh_token(user_id: str, cafe_id: str, role: str) -> str:
    return _create_token(
        {"user_id": user_id, "cafe_id": cafe_id, "role": role},
        timedelta(days=settings.jwt_refresh_expiry_days),
        "refresh",
    )


def create_device_token(device_id: str, cafe_id: str) -> str:
    """Access token for a paired ordering device (no user identity of its own —
    the current waiter is resolved live from the device's activation record)."""
    return _create_token(
        {"device_id": device_id, "cafe_id": cafe_id, "role": "staff"},
        timedelta(hours=settings.jwt_expiry_hours),
        "access",
    )


def create_device_refresh_token(device_id: str, cafe_id: str) -> str:
    return _create_token(
        {"device_id": device_id, "cafe_id": cafe_id, "role": "staff"},
        timedelta(days=settings.jwt_refresh_expiry_days),
        "refresh",
    )


def decode_token(token: str, expected_type: str = "access") -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token.")
    if payload.get("type") != expected_type:
        raise HTTPException(status_code=401, detail=f"Expected a {expected_type} token.")
    return payload
