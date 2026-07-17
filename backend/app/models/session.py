from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.common import DBModel, SessionStatus, new_id, utcnow


class DaySession(DBModel):
    id: str = Field(default_factory=new_id)
    cafe_id: str
    session_date: str
    opening_cash: float
    closing_cash: Optional[float] = None
    expected_cash: Optional[float] = None
    total_sales: float = 0
    total_bills: int = 0
    status: str = SessionStatus.open.value
    opened_at: datetime = Field(default_factory=utcnow)
    closed_at: Optional[datetime] = None


class DaySessionOpen(BaseModel):
    opening_cash: float


class DaySessionClose(BaseModel):
    session_id: str
    closing_cash: float
