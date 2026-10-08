"""UPI auto-settlement: gateway settings, per-bill payment requests (dynamic QR)
and the record of every payment notification the gateway sends us."""
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field

from app.models.bill import BillItem
from app.models.common import DBModel, new_id, utcnow


class PaymentRequestStatus(str, Enum):
    pending = "pending"      # QR shown, waiting for the customer to pay
    paid = "paid"            # payment received and the bill settled
    cancelled = "cancelled"  # superseded by a new QR, or staff cancelled / settled by hand


class PaymentStatus(str, Enum):
    settled = "settled"            # matched to a table and the bill was created
    needs_review = "needs_review"  # money arrived but we couldn't safely pick a table
    dismissed = "dismissed"        # reviewed by staff and closed without settling
    ignored = "ignored"            # a non-success notification (failed / pending)


class PaymentSettings(DBModel):
    cafe_id: str
    enabled: bool = False
    provider: str = "mock"
    merchant_id: str = ""
    # UPI ID that dynamic QRs pay into, e.g. "cafe@ybl".
    vpa: str = ""
    payee_name: str = ""
    # Fernet-encrypted webhook signing secret (never returned by the API).
    webhook_secret_enc: str = ""
    updated_at: datetime = Field(default_factory=utcnow)


class PaymentSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    provider: Optional[str] = None
    merchant_id: Optional[str] = None
    vpa: Optional[str] = None
    payee_name: Optional[str] = None
    # Set to replace the stored secret; omit/empty to keep it.
    webhook_secret: Optional[str] = None


class PaymentRequestCreate(BaseModel):
    """Everything needed to settle the bill once paid — the same fields the
    Settle dialog would send to POST /bills."""
    table_id: Optional[str] = None
    order_id: Optional[str] = None
    items: List[BillItem]
    packing_charge: float = 0.0
    delivery_charge: float = 0.0
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None


class PaymentRequest(DBModel):
    id: str = Field(default_factory=new_id)
    cafe_id: str
    # Short alphanumeric order reference embedded in the QR (UPI "tr"), e.g. "T4-8F2A1C".
    reference: str
    provider: str
    table_id: Optional[str] = None
    order_id: Optional[str] = None
    amount: float
    status: PaymentRequestStatus = PaymentRequestStatus.pending
    qr_payload: str
    # Settle snapshot (what the customer is paying for).
    items: List[BillItem]
    packing_charge: float = 0.0
    delivery_charge: float = 0.0
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    # Hash of the saved order's items when the QR was made; if the order is
    # edited before the money arrives we flag it instead of settling stale items.
    order_fingerprint: Optional[str] = None
    bill_id: Optional[str] = None
    transaction_id: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    paid_at: Optional[datetime] = None


class Payment(DBModel):
    id: str = Field(default_factory=new_id)
    cafe_id: str
    provider: str
    transaction_id: str
    amount: float
    reference: Optional[str] = None
    gateway_status: str
    status: PaymentStatus = PaymentStatus.needs_review
    # Why it needs review: unknown_reference, amount_mismatch, already_settled,
    # order_changed, no_match, multiple_matches.
    review_reason: Optional[str] = None
    # Tables whose open bill equals the amount (for the "which table?" prompt).
    candidate_table_ids: List[str] = []
    table_id: Optional[str] = None
    bill_id: Optional[str] = None
    payment_request_id: Optional[str] = None
    paid_at: Optional[datetime] = None
    received_at: datetime = Field(default_factory=utcnow)
    resolved_by: Optional[str] = None
    note: Optional[str] = None


class PaymentAssign(BaseModel):
    table_id: str


class PaymentDismiss(BaseModel):
    note: Optional[str] = None


class MockPaymentSimulate(BaseModel):
    """Dev helper: pretend the customer paid. ``reference`` set = dynamic QR;
    omitted = a static counter-QR payment matched by amount only."""
    amount: float = Field(gt=0)
    reference: Optional[str] = None
    transaction_id: Optional[str] = None
