from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

from app.core.deps import get_current_user, require_role, require_user_session
from app.db.mongo import db
from app.models.bill import Bill, BillCreate
from app.models.common import SessionStatus
from app.services.billing import claim_series, reserve_series_block
from app.services.settlement import settle_bill

router = APIRouter(prefix="/bills", tags=["bills"])


@router.post("", response_model=Bill)
async def create_bill(payload: BillCreate, current_user: dict = Depends(require_user_session)):
    return await settle_bill(db, current_user["cafe_id"], payload)


class SeriesClaimIn(BaseModel):
    preferred: Optional[str] = None


class SeriesReserveIn(BaseModel):
    series_code: str
    count: int = Field(default=50, ge=1, le=1000)


@router.post("/series/claim")
async def claim_bill_series(payload: SeriesClaimIn, current_user: dict = Depends(require_user_session)):
    """Reserve a unique invoice-serial series for this device (one-time)."""
    code = await claim_series(db, current_user["cafe_id"], payload.preferred)
    return {"series_code": code}


@router.post("/series/reserve")
async def reserve_bill_serials(payload: SeriesReserveIn, current_user: dict = Depends(require_user_session)):
    """Reserve a contiguous block of serials so the device can bill offline."""
    return await reserve_series_block(db, current_user["cafe_id"], payload.series_code, payload.count)


@router.get("", response_model=List[Bill])
async def get_bills(
    limit: int = 100,
    skip: int = 0,
    date_filter: Optional[str] = None,
    current_user: dict = Depends(require_user_session),
):
    query = {"cafe_id": current_user["cafe_id"], "soft_deleted": False}
    if date_filter:
        start = datetime.fromisoformat(date_filter).replace(hour=0, minute=0, second=0)
        end = start.replace(hour=23, minute=59, second=59)
        query["created_at"] = {"$gte": start.isoformat(), "$lte": end.isoformat()}
    return await db.bills.find(query, {"_id": 0}).sort("bill_number", -1).skip(skip).to_list(limit)


class BillVoidIn(BaseModel):
    reason: Optional[str] = None


@router.post("/{bill_id}/void")
async def void_bill(
    bill_id: str,
    payload: BillVoidIn,
    current_user: dict = Depends(require_role(["owner", "superadmin"])),
):
    """Soft-delete a duplicate/erroneous bill (e.g. a double-settle from offline
    replay) and reverse its accrual from today's open session. Never hard-deletes
    — the record is retained for GST/audit."""
    cafe_id = current_user["cafe_id"]
    bill = await db.bills.find_one({"id": bill_id, "cafe_id": cafe_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.get("soft_deleted"):
        return {"message": "Bill already voided"}

    await db.bills.update_one(
        {"id": bill_id},
        {"$set": {
            "soft_deleted": True,
            "void_reason": (payload.reason or "").strip() or None,
            "voided_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    # Reverse the day-session accrual only if this bill belongs to today's open
    # session (mirrors the increment done at settle time).
    created = bill.get("created_at", "")
    if isinstance(created, str) and created[:10] == date.today().isoformat():
        session = await db.day_sessions.find_one(
            {"cafe_id": cafe_id, "session_date": date.today().isoformat(), "status": SessionStatus.open.value}
        )
        if session:
            updated = await db.day_sessions.find_one_and_update(
                {"id": session["id"]},
                {"$inc": {"total_sales": -bill.get("total", 0), "total_bills": -1}},
                return_document=ReturnDocument.AFTER,
            )
            await db.day_sessions.update_one(
                {"id": session["id"]},
                {"$set": {"expected_cash": updated.get("opening_cash", 0) + updated.get("total_sales", 0)}},
            )
    return {"message": "Bill voided"}


@router.get("/{bill_id}", response_model=Bill)
async def get_bill(bill_id: str, current_user: dict = Depends(require_user_session)):
    bill = await db.bills.find_one({"id": bill_id, "soft_deleted": False}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this bill.")
    return bill
