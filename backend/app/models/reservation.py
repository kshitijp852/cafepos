from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.common import DBModel, ReservationStatus, new_id, utcnow


class Reservation(DBModel):
    id: str = Field(default_factory=new_id)
    cafe_id: str
    table_id: str
    customer_name: str
    customer_phone: str
    guest_count: int
    reservation_date: str
    reservation_time: str
    status: str = ReservationStatus.confirmed.value
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class ReservationCreate(BaseModel):
    table_id: str
    customer_name: str
    customer_phone: str
    guest_count: int
    reservation_date: str
    reservation_time: str
    notes: Optional[str] = None


class ReservationUpdate(BaseModel):
    """Typed partial update — replaces the previous untyped Dict[str, Any] body."""
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    guest_count: Optional[int] = None
    reservation_date: Optional[str] = None
    reservation_time: Optional[str] = None
    status: Optional[ReservationStatus] = None
    notes: Optional[str] = None
