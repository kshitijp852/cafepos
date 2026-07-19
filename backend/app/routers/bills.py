from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from app.core.deps import get_current_user
from app.db.mongo import db
from app.db.serialization import to_mongo
from app.models.bill import Bill, BillCreate
from app.models.common import OrderStatus, SessionStatus, TableStatus
from app.core.config import get_settings
from app.services.billing import calculate_bill_hash, next_bill_number
from app.services.cafe import get_tax_percentage
from app.services.phone import to_e164

router = APIRouter(prefix="/bills", tags=["bills"])
settings = get_settings()


@router.post("", response_model=Bill)
async def create_bill(payload: BillCreate, current_user: dict = Depends(get_current_user)):
    cafe_id = current_user["cafe_id"]
    tax_pct = payload.tax_percentage if payload.tax_percentage is not None else await get_tax_percentage(db, cafe_id)

    subtotal = sum(item.price * item.quantity for item in payload.items)
    tax = subtotal * (tax_pct / 100)
    total = subtotal + tax

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
        bill_number=bill_number,
        cafe_id=cafe_id,
        table_id=payload.table_id,
        items=payload.items,
        subtotal=subtotal,
        tax=tax,
        tax_percentage=tax_pct,
        total=total,
        payment_method=payload.payment_method,
        bill_hash=calculate_bill_hash(bill_number, payload.items, total, timestamp),
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


@router.get("", response_model=List[Bill])
async def get_bills(
    limit: int = 100,
    skip: int = 0,
    date_filter: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {"cafe_id": current_user["cafe_id"], "soft_deleted": False}
    if date_filter:
        start = datetime.fromisoformat(date_filter).replace(hour=0, minute=0, second=0)
        end = start.replace(hour=23, minute=59, second=59)
        query["created_at"] = {"$gte": start.isoformat(), "$lte": end.isoformat()}
    return await db.bills.find(query, {"_id": 0}).sort("bill_number", -1).skip(skip).to_list(limit)


@router.get("/{bill_id}", response_model=Bill)
async def get_bill(bill_id: str, current_user: dict = Depends(get_current_user)):
    bill = await db.bills.find_one({"id": bill_id, "soft_deleted": False}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this bill.")
    return bill
