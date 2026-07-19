import re
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


def _slug(text: str) -> str:
    """Lowercase, keep alphanumerics only — 'Ground Floor' -> 'groundfloor'."""
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def table_code(floor_name: str, table_name: str) -> str:
    """floorname + tablename, e.g. ('Ground Floor', 'T1') -> 'groundfloor-T1'.
    Floor-scoped so the same table name/prefix can repeat on different floors."""
    return f"{_slug(floor_name)}-{table_name}"


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
    cafe_id = current_user["cafe_id"]
    floor = await db.floors.find_one({"id": payload.floor_id, "cafe_id": cafe_id})
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found in your cafe.")
    code = table_code(floor["name"], payload.name)
    if await db.tables.find_one({"cafe_id": cafe_id, "code": code}):
        raise HTTPException(status_code=409, detail=f'"{payload.name}" already exists on {floor["name"]}.')
    table = Table(
        name=payload.name,
        code=code,
        floor_id=payload.floor_id,
        capacity=payload.capacity,
        cafe_id=cafe_id,
    )
    await db.tables.insert_one(to_mongo(table))
    return table


@router.post("/tables/bulk", response_model=List[Table])
async def create_tables_bulk(payload: TableBulkCreate, current_user: dict = Depends(_MANAGER)):
    """Create many tables at once (prefix + running number). Existing tables on the
    same floor are skipped so re-running is safe. The same prefix can be reused on
    other floors — dedup is floor-scoped via the floorname+name code."""
    cafe_id = current_user["cafe_id"]
    floor = await db.floors.find_one({"id": payload.floor_id, "cafe_id": cafe_id})
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found in your cafe.")

    # Only codes already taken across the cafe collide (floor-scoped by construction).
    existing = {
        t["code"] async for t in db.tables.find({"cafe_id": cafe_id}, {"_id": 0, "code": 1}) if t.get("code")
    }
    new_tables = []
    for n in range(payload.start, payload.start + payload.count):
        name = f"{payload.prefix}{n}"
        code = table_code(floor["name"], name)
        if code in existing:
            continue
        existing.add(code)
        new_tables.append(
            Table(name=name, code=code, floor_id=payload.floor_id, capacity=payload.capacity, cafe_id=cafe_id)
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
    # Rename or floor move changes the floorname+name code — recompute and guard uniqueness.
    if "name" in updates or "floor_id" in updates:
        new_name = updates.get("name", existing["name"])
        new_floor_id = updates.get("floor_id", existing["floor_id"])
        floor = await db.floors.find_one({"id": new_floor_id, "cafe_id": current_user["cafe_id"]})
        if not floor:
            raise HTTPException(status_code=404, detail="Floor not found in your cafe.")
        code = table_code(floor["name"], new_name)
        clash = await db.tables.find_one({"cafe_id": current_user["cafe_id"], "code": code, "id": {"$ne": table_id}})
        if clash:
            raise HTTPException(status_code=409, detail=f'"{new_name}" already exists on {floor["name"]}.')
        updates["code"] = code
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
