from datetime import datetime
from typing import Optional

from pydantic import Field

from app.models.common import DBModel, new_id, utcnow


class Cafe(DBModel):
    id: str = Field(default_factory=new_id)
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    gst_number: Optional[str] = None
    # Single source of truth for the default tax rate, applied to both orders
    # and bills so their totals can never diverge.
    tax_percentage: float = 5.0
    created_at: datetime = Field(default_factory=utcnow)
