from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder

from app.core.deps import get_current_user, require_role
from app.db.mongo import db
from app.db.serialization import to_mongo
from app.models.common import Role
from app.models.table import Floor, FloorCreate, Table, TableBulkCreate, TableCreate, TableUpdate

router = APIRouter(tags=["tables"])
_MANAGER = require_role([Role.owner.value, Role.superadmin.value])


@router.get("/floors", response_model=List[Floor])
async def get_floors(current_user: dict = Depends(get_current_user)):
    return await db.floors.find({"cafe_id": current_user["cafe_id"]}, {"_id": 0}).to_list(1000)


@router.post("/floors", response_model=Floor)
async def create_floor(payload: FloorCreate, current_user: dict = Depends(_MANAGER)):
    floor = Floor(name=payload.name, cafe_id=current_user["cafe_id"])
    await db.floors.insert_one(to_mongo(floor))
    return floor


@router.get("/tables", response_model=List[Table])
async def get_tables(current_user: dict = Depends(get_current_user)):
    return await db.tables.find({"cafe_id": current_user["cafe_id"]}, {"_id": 0}).to_list(1000)


@router.post("/tables", response_model=Table)
async def create_table(payload: TableCreate, current_user: dict = Depends(_MANAGER)):
    table = Table(
        name=payload.name,
        floor_id=payload.floor_id,
        capacity=payload.capacity,
        cafe_id=current_user["cafe_id"],
    )
    await db.tables.insert_one(to_mongo(table))
    return table


@router.post("/tables/bulk", response_model=List[Table])
async def create_tables_bulk(payload: TableBulkCreate, current_user: dict = Depends(_MANAGER)):
    """Create many tables at once (prefix + running number). Existing names are
    skipped so re-running is safe. Managers can rename/adjust each one later."""
    cafe_id = current_user["cafe_id"]
    if not await db.floors.find_one({"id": payload.floor_id, "cafe_id": cafe_id}):
        raise HTTPException(status_code=404, detail="Floor not found in your cafe.")

    existing = {
        t["name"] async for t in db.tables.find({"cafe_id": cafe_id}, {"_id": 0, "name": 1})
    }
    new_tables = []
    for n in range(payload.start, payload.start + payload.count):
        name = f"{payload.prefix}{n}"
        if name in existing:
            continue
        existing.add(name)
        new_tables.append(
            Table(name=name, floor_id=payload.floor_id, capacity=payload.capacity, cafe_id=cafe_id)
        )

    if new_tables:
        await db.tables.insert_many([to_mongo(t) for t in new_tables])
    return new_tables


@router.put("/tables/{table_id}", response_model=Table)
async def update_table(table_id: str, payload: TableUpdate, current_user: dict = Depends(get_current_user)):
    existing = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Table not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this table.")
    updates = payload.model_dump(exclude_unset=True)
    if updates:
        # jsonable_encoder coerces enums to their string values for storage.
        await db.tables.update_one({"id": table_id}, {"$set": jsonable_encoder(updates)})
    return await db.tables.find_one({"id": table_id}, {"_id": 0})


@router.delete("/tables/{table_id}")
async def delete_table(table_id: str, current_user: dict = Depends(_MANAGER)):
    existing = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Table not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this table.")
    # Don't delete a table mid-service — its order would be orphaned.
    if existing.get("current_order_id") or existing.get("status") == "occupied":
        raise HTTPException(status_code=400, detail="Settle or clear this table's order before deleting it.")
    await db.tables.delete_one({"id": table_id})
    return {"message": "Table deleted."}
