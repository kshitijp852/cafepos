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
    # Per-device invoice-serial series prefix (e.g. "C", "B2"). Empty = the
    # default/legacy single counter line. Displayed as "{series}-{bill_number}".
    series: str = ""
    cafe_id: str
    table_id: Optional[str] = None
    items: List[BillItem]
    subtotal: float
    tax: float
    tax_percentage: float = 5.0
    # Tax split (amounts) for GST-compliant receipts.
    cgst: float = 0.0
    sgst: float = 0.0
    cgst_percentage: float = 0.0
    sgst_percentage: float = 0.0
    # Order-type charges (packing on take-away, delivery on delivery).
    packing_charge: float = 0.0
    delivery_charge: float = 0.0
    total: float
    payment_method: PaymentMethod = PaymentMethod.cash
    bill_hash: str
    cloud_synced: bool = True
    order_id: Optional[str] = None
    # Attributed staff (copied from the settled order), for per-staff analytics.
    waiter_id: Optional[str] = None
    waiter_name: Optional[str] = None
    # How long the customer occupied the table, first order -> this settlement.
    dwell_seconds: Optional[int] = None
    # Captured at settlement for receipts + future WhatsApp messaging.
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    soft_deleted: bool = False


class BillCreate(BaseModel):
    # Client may supply the id so an offline-queued settle can be replayed
    # idempotently (see create_bill). Omitted for normal online settles.
    id: Optional[str] = None
    # A device that draws its invoice serial locally (from a reserved block)
    # sends the pre-assigned series + bill_number so the server records them
    # as-is. Omitted for online settles → server allocates from the default line.
    series: Optional[str] = None
    bill_number: Optional[int] = None
    table_id: Optional[str] = None
    items: List[BillItem]
    # Optional: when omitted the cafe's configured tax rate is applied.
    tax_percentage: Optional[float] = None
    # Charges chosen at settle (default 0 = none, e.g. dine-in).
    packing_charge: float = 0.0
    delivery_charge: float = 0.0
    payment_method: PaymentMethod = PaymentMethod.cash
    order_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
