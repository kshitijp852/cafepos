import re
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models.cafe import normalize_gst
from app.models.common import DBModel, Role, new_id, utcnow

# Accept 10–15 digits, optional leading "+", ignoring spaces/dashes/parens.
_PHONE_RE = re.compile(r"^\+?\d{10,15}$")


def _normalize_phone(value: str) -> str:
    cleaned = re.sub(r"[\s\-()]", "", value or "")
    if not _PHONE_RE.match(cleaned):
        raise ValueError("Enter a valid phone number (10–15 digits, optional +country code).")
    return cleaned


class User(DBModel):
    id: str = Field(default_factory=new_id)
    email: str
    name: str
    phone: Optional[str] = None
    role: str = Role.owner.value  # platform_admin, owner, manager, waiter, kitchen
    cafe_id: Optional[str] = None  # None only for platform_admin
    is_email_verified: bool = False
    is_active: bool = True
    last_active: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    cafe_name: str


class RegisterStart(BaseModel):
    """Step 1 of manager signup: validate + trigger the email OTP.

    GST is mandatory for real accounts; a signup carrying a valid ``test_code``
    (checked against TEST_SIGNUP_CODE in the router) may omit it.
    """
    name: str = Field(min_length=1)
    phone: str
    email: EmailStr
    cafe_name: str = Field(min_length=1)
    gst_number: Optional[str] = None
    test_code: Optional[str] = None
    password: str = Field(min_length=6)
    confirm_password: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return _normalize_phone(v)

    @field_validator("gst_number")
    @classmethod
    def _gst(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        return normalize_gst(v)

    @model_validator(mode="after")
    def _passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class RegisterVerify(BaseModel):
    """Step 2 of manager signup: confirm the OTP and create the account."""
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)


class ResetRequest(BaseModel):
    email: EmailStr


class ResetConfirm(BaseModel):
    token: str
    password: str = Field(min_length=6)
    confirm_password: str

    @model_validator(mode="after")
    def _passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class ProfileUpdate(BaseModel):
    """Owner edits their own account details. Email is identity — not editable here."""
    name: Optional[str] = Field(default=None, min_length=1)
    phone: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        return _normalize_phone(v)


class PasswordChange(BaseModel):
    """Signed-in password change (distinct from the emailed reset flow)."""
    current_password: str
    password: str = Field(min_length=6)
    confirm_password: str

    @model_validator(mode="after")
    def _passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class LoginStart(BaseModel):
    """Step 1 of the unified login flow: branch into OTP-first-login or password."""
    email: EmailStr


class FirstLogin(BaseModel):
    """Step 2 for a user who has never signed in: confirm the OTP and set a password."""
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=6)
    confirm_password: str

    @model_validator(mode="after")
    def _passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class TokenRefresh(BaseModel):
    refresh_token: str


class AuthResponse(BaseModel):
    user: User
    token: str
    refresh_token: str


class StaffInvite(BaseModel):
    """Owner/manager invites a new staff member — one endpoint for every role.
    An owner may invite any of the three; a manager may not invite another
    manager (enforced at the call site, not here)."""
    name: str = Field(min_length=1)
    email: EmailStr
    role: Literal["waiter", "kitchen", "manager"]


class WaiterUpdate(BaseModel):
    """Admin edit of a staff roster entry. Any field omitted is left unchanged."""
    name: Optional[str] = None
