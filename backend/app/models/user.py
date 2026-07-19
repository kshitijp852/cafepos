import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

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
    username: Optional[str] = None  # staff log in with this; managers use email
    phone: Optional[str] = None
    role: str = Role.owner.value  # superadmin, owner, staff
    cafe_id: str
    pin: Optional[str] = None  # bcrypt-hashed 4-digit PIN for staff
    is_active: bool = True
    device_token: Optional[str] = None
    last_active: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    cafe_name: str


class RegisterStart(BaseModel):
    """Step 1 of manager signup: validate + trigger the email OTP."""
    name: str = Field(min_length=1)
    phone: str
    email: EmailStr
    cafe_name: str = Field(min_length=1)
    password: str = Field(min_length=6)
    confirm_password: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return _normalize_phone(v)

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


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenRefresh(BaseModel):
    refresh_token: str


class AuthResponse(BaseModel):
    user: User
    token: str
    refresh_token: str


class WaiterCreate(BaseModel):
    """Manager adds a staff member to the roster (a name for attribution).
    No login credentials — staff never sign in; devices do."""
    name: str = Field(min_length=1)
    username: Optional[str] = None


class WaiterUpdate(BaseModel):
    """Admin edit of a staff roster entry. Any field omitted is left unchanged."""
    name: Optional[str] = None
    username: Optional[str] = None


class DeviceActivate(BaseModel):
    """Manager authorizes a paired device by its code, optionally naming it and
    assigning the current waiter (both may be set/changed later)."""
    code: str
    waiter_id: Optional[str] = None
    device_name: Optional[str] = None


class DeviceCodeRequest(BaseModel):
    """A device asks for a pairing code before a manager activates it."""
    device_id: str


class DevicePoll(BaseModel):
    """A device polls with its code until a manager activates it."""
    device_id: str
    code: str


class DeviceAssign(BaseModel):
    """Manager sets/clears the current waiter on a device and/or renames it.
    user_id=None clears the assignment (device becomes ordering-only)."""
    user_id: Optional[str] = None
    device_name: Optional[str] = None


class DeviceLogout(BaseModel):
    """Waiter signs out on a device; the pairing is kept but marked logged-out."""
    device_id: str


class DeviceActivation(DBModel):
    """A device-authorization record. Pending rows carry expires_at (TTL-purged);
    active rows have it unset so they are never auto-deleted.

    user_id / cafe_id are optional because the credential-less flow creates the
    record before a staff member is chosen; the manager assigns them on activation."""
    id: str = Field(default_factory=new_id)
    user_id: Optional[str] = None
    cafe_id: Optional[str] = None
    device_id: str
    code: str
    device_name: Optional[str] = None
    status: str = "pending"  # pending | active
    signed_in: bool = False  # is a waiter currently signed in on this paired device
    last_login: Optional[datetime] = None
    last_logout: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
    expires_at: Optional[datetime] = None
    activated_by: Optional[str] = None
    activated_at: Optional[datetime] = None
