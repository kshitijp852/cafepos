from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.common import DBModel, new_id, utcnow


class InventoryItem(DBModel):
    id: str = Field(default_factory=new_id)
    name: str
    cafe_id: str
    unit: str
    current_stock: float
    min_stock: float
    max_stock: float
    cost_per_unit: float
    last_restocked: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)


class InventoryItemCreate(BaseModel):
    name: str
    unit: str
    current_stock: float
    min_stock: float
    max_stock: float
    cost_per_unit: float


class InventoryUpdate(BaseModel):
    """Typed partial update — replaces the previous untyped Dict[str, Any] body."""
    name: Optional[str] = None
    unit: Optional[str] = None
    current_stock: Optional[float] = None
    min_stock: Optional[float] = None
    max_stock: Optional[float] = None
    cost_per_unit: Optional[float] = None
    last_restocked: Optional[datetime] = None
