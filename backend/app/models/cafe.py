from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.common import DBModel, new_id, utcnow


class Cafe(DBModel):
    id: str = Field(default_factory=new_id)
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    gst_number: Optional[str] = None
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
    gst_number: Optional[str] = None
    cgst_percentage: Optional[float] = Field(default=None, ge=0)
    sgst_percentage: Optional[float] = Field(default=None, ge=0)
    packing_charge: Optional[float] = Field(default=None, ge=0)
    delivery_charge: Optional[float] = Field(default=None, ge=0)
