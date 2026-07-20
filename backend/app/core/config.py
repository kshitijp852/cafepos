"""Typed application settings loaded from the environment / backend/.env.

No insecure fallbacks: JWT_SECRET and MONGO_URL are required, so the app
refuses to start misconfigured instead of silently running on a known secret.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ directory (config.py is at backend/app/core/config.py)
BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    mongo_url: str
    db_name: str = "pos_database"

    # CORS — comma-separated origins. "*" must not be combined with credentials.
    cors_origins: str = "http://localhost:3000"

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"

    # Symmetric key (urlsafe-base64, 32 bytes) for encrypting recoverable staff
    # passwords at rest. If empty, a key is derived from jwt_secret so no extra
    # config is required; set explicitly to rotate independently of the JWT secret.
    credential_enc_key: str = ""
    jwt_expiry_hours: int = 24
    jwt_refresh_expiry_days: int = 30

    # Frontend base URL — used to build password-reset links in emails.
    frontend_base_url: str = "http://localhost:3000"

    # Email (Gmail SMTP). Leave user/password empty to run in DEV mode, where
    # emails are logged instead of sent and the OTP / reset link is returned in
    # the API response so local signup + reset can be exercised without a mailbox.
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_app_password: str = ""
    smtp_from: str = ""
    smtp_from_name: str = "Cafe POS"

    # OTP / reset-token lifetimes.
    otp_expiry_minutes: int = 10
    otp_max_attempts: int = 5
    reset_token_expiry_minutes: int = 30

    # Waiter device-pairing code lifetime (pending activation).
    device_code_expiry_minutes: int = 15

    # RapidAPI credentials for Indian pincode -> city/state lookup. Proxied by
    # the backend so the key never reaches the browser bundle. Empty disables
    # the lookup (the field stays manually editable).
    rapidapi_key: str = ""
    pincode_api_host: str = "pincode.p.rapidapi.com"

    # Shared secret that lets a signup skip the mandatory GST number (demo /
    # QA accounts). Empty (the default) disables the bypass entirely, so a
    # production instance cannot be talked out of collecting GST.
    test_signup_code: str = ""

    # Default country code (no '+') for normalizing local customer phone numbers
    # to E.164 at settlement. 91 = India.
    default_country_code: str = "91"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def email_configured(self) -> bool:
        return bool(self.smtp_user and self.smtp_app_password)

    @property
    def email_sender(self) -> str:
        return self.smtp_from or self.smtp_user


@lru_cache
def get_settings() -> Settings:
    return Settings()
