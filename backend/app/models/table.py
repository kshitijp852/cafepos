from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.common import DBModel, TableStatus, new_id, utcnow


class Floor(DBModel):
    id: str = Field(default_factory=new_id)
    name: str
    cafe_id: str
    created_at: datetime = Field(default_factory=utcnow)


class FloorCreate(BaseModel):
    name: str


class Table(DBModel):
    id: str = Field(default_factory=new_id)
    name: str
    # Human-readable, floor-scoped code: floorname + prefix + number (e.g. "groundfloor-T1").
    # Unique per cafe; lets the same prefix repeat on different floors.
    code: Optional[str] = None
    floor_id: str
    capacity: int
    status: str = TableStatus.available.value
    cafe_id: str
    current_order_id: Optional[str] = None
    # When the table was first occupied (first order of the current sitting).
    # Drives the live dwell timer; cleared when the bill is settled/table freed.
    seated_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)


class TableCreate(BaseModel):
    name: str
    floor_id: str
    capacity: int


class TableBulkCreate(BaseModel):
    """Generate a run of tables at once, e.g. prefix='T', start=1, count=10 -> T1..T10."""
    floor_id: str
    count: int = Field(ge=1, le=100)
    capacity: int = Field(ge=1, default=4)
    prefix: str = "T"
    start: int = Field(ge=0, default=1)


class TableUpdate(BaseModel):
    """Typed partial update — replaces the previous untyped Dict[str, Any] body."""
    name: Optional[str] = None
    floor_id: Optional[str] = None
    capacity: Optional[int] = None
    status: Optional[TableStatus] = None
    current_order_id: Optional[str] = None


class TableTransfer(BaseModel):
    """Move the sitting at one table to another."""
    to_table_id: str
