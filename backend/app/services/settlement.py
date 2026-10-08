"""Bill settlement: the one code path that turns a sale into a bill.

Used by the manual settle endpoint (``POST /bills``) and by UPI auto-settlement
when a payment webhook arrives, so both produce identical bills, free the table,
close the order and accrue into the day session the same way.
"""
from datetime import date, datetime, timezone
from typing import Any, List, Optional

from pymongo import ReturnDocument

from app.core.config import get_settings
from app.models.bill import Bill, BillCreate, BillItem
from app.models.common import OrderStatus, SessionStatus, TableStatus, new_id
from app.models.payment import PaymentRequestStatus
from app.db.serialization import to_mongo
from app.services import events
from app.services.billing import calculate_bill_hash, next_bill_number
from app.services.phone import to_e164

settings = get_settings()


def compute_totals(
    cafe: dict[str, Any],
    items: List[BillItem],
    tax_percentage: Optional[float] = None,
    packing_charge: float = 0.0,
    delivery_charge: float = 0.0,
) -> dict[str, float]:
    """Bill amounts from cafe tax settings (CGST + SGST). A ``tax_percentage``
    override is split proportionally across the two components."""
    cgst_pct = float(cafe.get("cgst_percentage", 2.5))
    sgst_pct = float(cafe.get("sgst_percentage", 2.5))
    if tax_percentage is not None:
        base = cgst_pct + sgst_pct
        if base > 0:
            ratio = tax_percentage / base
            cgst_pct, sgst_pct = round(cgst_pct * ratio, 4), round(sgst_pct * ratio, 4)
        else:
            cgst_pct = sgst_pct = tax_percentage / 2

    subtotal = sum(item.price * item.quantity for item in items)
    cgst = subtotal * (cgst_pct / 100)
    sgst = subtotal * (sgst_pct / 100)
    packing = max(0.0, packing_charge or 0.0)
    delivery = max(0.0, delivery_charge or 0.0)
    return {
        "subtotal": subtotal,
        "cgst": cgst,
        "sgst": sgst,
        "cgst_percentage": cgst_pct,
        "sgst_percentage": sgst_pct,
        "tax": cgst + sgst,
        "tax_percentage": cgst_pct + sgst_pct,
        "packing_charge": packing,
        "delivery_charge": delivery,
        "total": subtotal + cgst + sgst + packing + delivery,
    }


async def settle_bill(db, cafe_id: str, payload: BillCreate) -> Bill:
    # Idempotent replay: a bill settled offline is queued with a client-generated
    # id and replayed on reconnect. If that id is already recorded, return the
    # stored bill unchanged — never re-insert or double-count the day session.
    if payload.id:
        existing = await db.bills.find_one({"id": payload.id, "cafe_id": cafe_id}, {"_id": 0})
        if existing:
            return existing

    cafe = await db.cafes.find_one({"id": cafe_id}, {"_id": 0}) or {}
    t = compute_totals(
        cafe, payload.items, payload.tax_percentage, payload.packing_charge, payload.delivery_charge
    )
    total = t["total"]

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
        subtotal=t["subtotal"],
        tax=t["tax"],
        tax_percentage=t["tax_percentage"],
        cgst=t["cgst"],
        sgst=t["sgst"],
        cgst_percentage=t["cgst_percentage"],
        sgst_percentage=t["sgst_percentage"],
        packing_charge=t["packing_charge"],
        delivery_charge=t["delivery_charge"],
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

    # A bill settled any other way (cash, card, a manual UPI confirm) retires the
    # table's live QR, so a late scan of it goes to review instead of re-settling.
    scope = [{"order_id": payload.order_id}] if payload.order_id else []
    if payload.table_id:
        scope.append({"table_id": payload.table_id})
    if scope:
        await db.payment_requests.update_many(
            {"cafe_id": cafe_id, "status": PaymentRequestStatus.pending.value, "id": {"$ne": bill.id}, "$or": scope},
            {"$set": {"status": PaymentRequestStatus.cancelled.value}},
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

    events.publish(cafe_id, "bill_settled", {
        "bill_id": bill.id,
        "table_id": bill.table_id,
        "total": bill.total,
        "payment_method": bill.payment_method.value,
    })
    return bill
