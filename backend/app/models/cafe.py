import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.models.common import DBModel, new_id, utcnow

# Indian GSTIN: 2-digit state code, 10-char PAN, entity digit, 'Z', checksum char.
GST_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$")


def normalize_gst(value: str) -> str:
    """Upper-case + strip a GSTIN, rejecting anything malformed."""
    cleaned = re.sub(r"[\s\-]", "", value or "").upper()
    if not GST_RE.match(cleaned):
        raise ValueError("Enter a valid 15-character GST number (e.g. 22AAAAA0000A1Z5).")
    return cleaned


class Cafe(DBModel):
    id: str = Field(default_factory=new_id)
    name: str
    address: Optional[str] = None
    # Pincode drives the city/state lookup; both stay editable by hand.
    pincode: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    phone: Optional[str] = None
    gst_number: Optional[str] = None
    # Test/demo accounts are created with a signup test code and are the only
    # ones allowed to run without a GST number.
    is_test_account: bool = False
    # Tax as a CGST + SGST split; tax_percentage is kept as their sum so existing
    # order/bill math (which applies one combined rate) stays correct.
    cgst_percentage: float = 2.5
    sgst_percentage: float = 2.5
    tax_percentage: float = 5.0
    # Cafe-wide default charges (editable at settle). Packing on take-away,
    # delivery on delivery orders; dine-in is exempt.
    packing_charge: float = 0.0
    delivery_charge: float = 0.0
    created_at: datetime = Field(default_factory=utcnow)


class CafeSettingsUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    pincode: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    gst_number: Optional[str] = None
    cgst_percentage: Optional[float] = Field(default=None, ge=0)
    sgst_percentage: Optional[float] = Field(default=None, ge=0)
    packing_charge: Optional[float] = Field(default=None, ge=0)
    delivery_charge: Optional[float] = Field(default=None, ge=0)

    @field_validator("pincode")
    @classmethod
    def _pincode(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        cleaned = re.sub(r"\s", "", v)
        if not re.fullmatch(r"\d{6}", cleaned):
            raise ValueError("Enter a 6-digit pincode.")
        return cleaned

    @field_validator("gst_number")
    @classmethod
    def _gst(cls, v: Optional[str]) -> Optional[str]:
        # Empty means "clear it" — only test accounts may, enforced in the router.
        if v is None or not v.strip():
            return None
        return normalize_gst(v)
