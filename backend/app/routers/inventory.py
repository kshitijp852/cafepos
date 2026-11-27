from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder

from app.core.deps import MANAGEMENT
from app.db.mongo import db
from app.db.serialization import to_mongo
from app.models.inventory import InventoryItem, InventoryItemCreate, InventoryUpdate

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("", response_model=List[InventoryItem])
async def get_inventory(current_user: dict = Depends(MANAGEMENT)):
    return await db.inventory.find({"cafe_id": current_user["cafe_id"]}, {"_id": 0}).to_list(1000)


@router.post("", response_model=InventoryItem)
async def create_inventory_item(payload: InventoryItemCreate, current_user: dict = Depends(MANAGEMENT)):
    item = InventoryItem(cafe_id=current_user["cafe_id"], **payload.model_dump())
    await db.inventory.insert_one(to_mongo(item))
    return item


@router.put("/{item_id}", response_model=InventoryItem)
async def update_inventory_item(item_id: str, payload: InventoryUpdate, current_user: dict = Depends(MANAGEMENT)):
    existing = await db.inventory.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Inventory item not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this inventory item.")
    updates = payload.model_dump(exclude_unset=True)
    if updates:
        await db.inventory.update_one({"id": item_id}, {"$set": jsonable_encoder(updates)})
    return await db.inventory.find_one({"id": item_id}, {"_id": 0})
