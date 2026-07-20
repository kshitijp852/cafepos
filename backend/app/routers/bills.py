from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

from app.core.deps import get_current_user, require_role, require_user_session
from app.db.mongo import db
from app.db.serialization import to_mongo
from app.models.bill import Bill, BillCreate
from app.models.common import OrderStatus, SessionStatus, TableStatus, new_id
from app.core.config import get_settings
from app.services.billing import (
    calculate_bill_hash,
    claim_series,
    next_bill_number,
    reserve_series_block,
)
from app.services.phone import to_e164

router = APIRouter(prefix="/bills", tags=["bills"])
settings = get_settings()


@router.post("", response_model=Bill)
async def create_bill(payload: BillCreate, current_user: dict = Depends(require_user_session)):
    cafe_id = current_user["cafe_id"]

    # Idempotent replay: a bill settled offline is queued with a client-generated
    # id and replayed on reconnect. If that id is already recorded, return the
    # stored bill unchanged — never re-insert or double-count the day session.
    if payload.id:
        existing = await db.bills.find_one({"id": payload.id, "cafe_id": cafe_id}, {"_id": 0})
        if existing:
            return existing

    cafe = await db.cafes.find_one({"id": cafe_id}, {"_id": 0}) or {}

    # Tax as CGST + SGST from cafe settings (combined = tax_percentage). A payload
    # tax_percentage override is split proportionally across the two components.
    cgst_pct = float(cafe.get("cgst_percentage", 2.5))
    sgst_pct = float(cafe.get("sgst_percentage", 2.5))
    if payload.tax_percentage is not None:
        base = cgst_pct + sgst_pct
        if base > 0:
            ratio = payload.tax_percentage / base
            cgst_pct, sgst_pct = round(cgst_pct * ratio, 4), round(sgst_pct * ratio, 4)
        else:
            cgst_pct = sgst_pct = payload.tax_percentage / 2
    tax_pct = cgst_pct + sgst_pct

    subtotal = sum(item.price * item.quantity for item in payload.items)
    cgst = subtotal * (cgst_pct / 100)
    sgst = subtotal * (sgst_pct / 100)
    tax = cgst + sgst
    packing = max(0.0, payload.packing_charge or 0.0)
    delivery = max(0.0, payload.delivery_charge or 0.0)
    total = subtotal + tax + packing + delivery

    # Numbering: a device that drew its serial locally (offline-safe) sends its
    # series + bill_number, recorded as-is. Otherwise allocate from the default
    # single line ("" series). The unique (cafe_id, series, bill_number) index is
    # the final backstop against any collision.
    if payload.series is not None and payload.bill_number is not None:
        series = payload.series
        bill_number = payload.bill_number
    else:
        series = ""
        bill_number = await next_bill_number(db, cafe_id)
    timestamp = datetime.now(timezone.utc)

    # Attribute the sale to the staff member who took the order (if any), so the
    # bill carries waiter info for per-staff analytics.
    waiter_id = waiter_name = None
    if payload.order_id:
        order = await db.orders.find_one({"id": payload.order_id}, {"_id": 0, "waiter_id": 1, "waiter_name": 1})
        if order:
            waiter_id = order.get("waiter_id")
            waiter_name = order.get("waiter_name")

    # How long the customer occupied the table (first order -> now), for records.
    dwell_seconds = None
    if payload.table_id:
        tdoc = await db.tables.find_one({"id": payload.table_id}, {"_id": 0, "seated_at": 1})
        seated = tdoc.get("seated_at") if tdoc else None
        if seated:
            seated_dt = datetime.fromisoformat(seated) if isinstance(seated, str) else seated
            dwell_seconds = max(0, int((timestamp - seated_dt).total_seconds()))

    bill = Bill(
        id=payload.id or new_id(),
        bill_number=bill_number,
        series=series,
        cafe_id=cafe_id,
        table_id=payload.table_id,
        items=payload.items,
        subtotal=subtotal,
        tax=tax,
        tax_percentage=tax_pct,
        cgst=cgst,
        sgst=sgst,
        cgst_percentage=cgst_pct,
        sgst_percentage=sgst_pct,
        packing_charge=packing,
        delivery_charge=delivery,
        total=total,
        payment_method=payload.payment_method,
        bill_hash=calculate_bill_hash(bill_number, payload.items, total, timestamp, series),
        order_id=payload.order_id,
        waiter_id=waiter_id,
        waiter_name=waiter_name,
        dwell_seconds=dwell_seconds,
        customer_name=(payload.customer_name or "").strip() or None,
        # Normalize to E.164 for messaging; fall back to the trimmed raw input so a
        # non-standard number is never silently dropped.
        customer_phone=to_e164(payload.customer_phone, settings.default_country_code)
        or ((payload.customer_phone or "").strip() or None),
        created_at=timestamp,
    )
    await db.bills.insert_one(to_mongo(bill))

    if payload.order_id:
        await db.orders.update_one(
            {"id": payload.order_id}, {"$set": {"status": OrderStatus.completed.value}}
        )
    if payload.table_id:
        await db.tables.update_one(
            {"id": payload.table_id},
            {"$set": {"status": TableStatus.available.value, "current_order_id": None, "seated_at": None}},
        )

    # Accrue into the open day session. Increment first, then derive expected_cash
    # from the fresh totals so it never depends on a stale pre-increment snapshot.
    today = date.today().isoformat()
    session = await db.day_sessions.find_one(
        {"cafe_id": cafe_id, "session_date": today, "status": SessionStatus.open.value}
    )
    if session:
        updated = await db.day_sessions.find_one_and_update(
            {"id": session["id"]},
            {"$inc": {"total_sales": total, "total_bills": 1}},
            return_document=ReturnDocument.AFTER,
        )
        await db.day_sessions.update_one(
            {"id": session["id"]},
            {"$set": {"expected_cash": updated.get("opening_cash", 0) + updated.get("total_sales", 0)}},
        )
    return bill


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
