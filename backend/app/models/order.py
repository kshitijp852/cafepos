from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field

from app.models.common import DBModel, OrderStatus, new_id, utcnow


class OrderItem(BaseModel):
    menu_item_id: str
    menu_item_name: str
    quantity: int
    price: float
    variants: Optional[List[dict[str, Any]]] = []
    addons: Optional[List[dict[str, Any]]] = []
    notes: Optional[str] = None


class Order(DBModel):
    id: str = Field(default_factory=new_id)
    cafe_id: str
    table_id: Optional[str] = None
    items: List[OrderItem]
    subtotal: float
    tax: float = 0
    tax_percentage: float = 5.0
    total: float
    status: str = OrderStatus.active.value
    waiter_id: Optional[str] = None
    waiter_name: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class OrderCreate(BaseModel):
    table_id: Optional[str] = None
    items: List[OrderItem]
    waiter_id: Optional[str] = None
    waiter_name: Optional[str] = None
    status: str = OrderStatus.active.value


class OrderUpdate(BaseModel):
    items: List[OrderItem]


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
