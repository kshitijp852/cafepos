"""Shared model primitives: id/timestamp factories, base model, and enums.

Enums replace the free-form strings the original code used, so a payment
method can never be both ``upi`` and ``online``, and roles/statuses are a
single source of truth.
"""
import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DBModel(BaseModel):
    """Base for stored entities — ignores unknown fields from Mongo docs."""
    model_config = ConfigDict(extra="ignore")


class Role(str, Enum):
    superadmin = "superadmin"
    owner = "owner"
    staff = "staff"


class TableStatus(str, Enum):
    available = "available"
    occupied = "occupied"
    reserved = "reserved"


class OrderStatus(str, Enum):
    # Retained set for Phase 1; the unified lifecycle is refined in Phase 2.
    active = "active"
    pending = "pending"
    preparing = "preparing"
    ready = "ready"
    completed = "completed"
    cancelled = "cancelled"


class PaymentMethod(str, Enum):
    cash = "cash"
    card = "card"
    upi = "upi"


class SessionStatus(str, Enum):
    open = "open"
    closed = "closed"


class ReservationStatus(str, Enum):
    confirmed = "confirmed"
    cancelled = "cancelled"
    completed = "completed"
