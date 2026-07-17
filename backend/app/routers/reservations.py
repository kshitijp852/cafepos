from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder

from app.core.deps import get_current_user
from app.db.mongo import db
from app.db.serialization import to_mongo
from app.models.common import ReservationStatus, TableStatus
from app.models.reservation import Reservation, ReservationCreate, ReservationUpdate

router = APIRouter(prefix="/reservations", tags=["reservations"])


@router.get("", response_model=List[Reservation])
async def get_reservations(date_filter: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {"cafe_id": current_user["cafe_id"]}
    if date_filter:
        query["reservation_date"] = date_filter
    return await db.reservations.find(query, {"_id": 0}).to_list(1000)


@router.post("", response_model=Reservation)
async def create_reservation(payload: ReservationCreate, current_user: dict = Depends(get_current_user)):
    reservation = Reservation(cafe_id=current_user["cafe_id"], **payload.model_dump())
    await db.reservations.insert_one(to_mongo(reservation))
    await db.tables.update_one(
        {"id": payload.table_id, "cafe_id": current_user["cafe_id"]},
        {"$set": {"status": TableStatus.reserved.value}},
    )
    return reservation


@router.put("/{reservation_id}", response_model=Reservation)
async def update_reservation(reservation_id: str, payload: ReservationUpdate, current_user: dict = Depends(get_current_user)):
    existing = await db.reservations.find_one({"id": reservation_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reservation not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this reservation.")
    updates = payload.model_dump(exclude_unset=True)
    if updates:
        await db.reservations.update_one({"id": reservation_id}, {"$set": jsonable_encoder(updates)})
    return await db.reservations.find_one({"id": reservation_id}, {"_id": 0})


@router.delete("/{reservation_id}")
async def cancel_reservation(reservation_id: str, current_user: dict = Depends(get_current_user)):
    reservation = await db.reservations.find_one({"id": reservation_id})
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found.")
    if reservation["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this reservation.")

    await db.tables.update_one(
        {"id": reservation["table_id"]}, {"$set": {"status": TableStatus.available.value}}
    )
    await db.reservations.update_one(
        {"id": reservation_id}, {"$set": {"status": ReservationStatus.cancelled.value}}
    )
    return {"message": "Reservation cancelled successfully"}
