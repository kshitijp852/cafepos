from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field

from app.models.common import DBModel, PaymentMethod, new_id, utcnow


class BillItem(BaseModel):
    menu_item_id: str
    menu_item_name: str
    quantity: int
    price: float
    variants: Optional[List[dict[str, Any]]] = []
    addons: Optional[List[dict[str, Any]]] = []
    notes: Optional[str] = None


class Bill(DBModel):
    id: str = Field(default_factory=new_id)
    bill_number: int
    cafe_id: str
    table_id: Optional[str] = None
    items: List[BillItem]
    subtotal: float
    tax: float
    tax_percentage: float = 5.0
    total: float
    payment_method: PaymentMethod = PaymentMethod.cash
    bill_hash: str
    cloud_synced: bool = True
    order_id: Optional[str] = None
    # Attributed staff (copied from the settled order), for per-staff analytics.
    waiter_id: Optional[str] = None
    waiter_name: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    soft_deleted: bool = False


class BillCreate(BaseModel):
    table_id: Optional[str] = None
    items: List[BillItem]
    # Optional: when omitted the cafe's configured tax rate is applied.
    tax_percentage: Optional[float] = None
    payment_method: PaymentMethod = PaymentMethod.cash
    order_id: Optional[str] = None
