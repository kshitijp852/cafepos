from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field

from app.models.common import DBModel, new_id, utcnow

# Indian-standard food marker. None = untagged.
FoodType = Literal["veg", "non_veg", "egg"]


class Category(DBModel):
    id: str = Field(default_factory=new_id)
    name: str
    cafe_id: str
    created_at: datetime = Field(default_factory=utcnow)


class CategoryCreate(BaseModel):
    name: str


class MenuItem(DBModel):
    id: str = Field(default_factory=new_id)
    name: str
    price: float
    category_id: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    available: bool = True
    food_type: Optional[FoodType] = None
    cafe_id: str
    variants: Optional[List[dict[str, Any]]] = []
    addons: Optional[List[dict[str, Any]]] = []
    created_at: datetime = Field(default_factory=utcnow)


class MenuItemCreate(BaseModel):
    name: str
    price: float
    category_id: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    available: bool = True
    food_type: Optional[FoodType] = None
    variants: Optional[List[dict[str, Any]]] = []
    addons: Optional[List[dict[str, Any]]] = []


class PriceChangeRequest(DBModel):
    """A manager's proposed price edit, held for owner approval. The item's
    current price stays live/authoritative until this resolves."""
    id: str = Field(default_factory=new_id)
    cafe_id: str
    menu_item_id: str
    current_price: float
    proposed_price: float
    requested_by: Optional[str] = None
    requested_at: datetime = Field(default_factory=utcnow)
    status: str = "pending"  # pending | approved | rejected
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
