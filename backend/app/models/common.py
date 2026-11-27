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
    platform_admin = "platform_admin"  # operates the platform; belongs to no cafe
    owner = "owner"
    manager = "manager"
    waiter = "waiter"
    kitchen = "kitchen"


class TableStatus(str, Enum):
    available = "available"
    occupied = "occupied"
    reserved = "reserved"


class OrderStatus(str, Enum):
    active = "active"
    pending = "pending"
    preparing = "preparing"
    ready = "ready"
    served = "served"  # handed to the table; awaiting payment
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
