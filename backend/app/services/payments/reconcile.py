"""Turn gateway payment notifications into settled tables.

Two ways a payment finds its table:

* **Dynamic QR (reference present).** The QR shown for a bill carried our
  reference, so the payment names its payment request exactly. We settle that
  bill if the amount matches and nothing changed since the QR was shown.
* **Static QR / soundbox (no reference).** Only amount + time are known. We
  compare the amount with every open bill; exactly one match settles it, zero or
  several go to staff as "which table paid?".

Anything we can't settle safely is kept as a ``needs_review`` payment and pushed
to the dashboard — money that arrived is never dropped or guessed at.
"""
import hashlib
import json
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, List, Optional

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.security import decrypt_secret
from app.db.serialization import to_mongo
from app.models.bill import Bill, BillCreate, BillItem
from app.models.common import OrderStatus, PaymentMethod
from app.models.payment import (
    Payment,
    PaymentRequest,
    PaymentRequestCreate,
    PaymentRequestStatus,
    PaymentStatus,
)
from app.services import events
from app.services.payments.gateways import GatewayConfig, PaymentGateway, PaymentNotification
from app.services.settlement import compute_totals, settle_bill

logger = logging.getLogger("cafepos")

_OPEN_ORDER = [
    OrderStatus.active.value,
    OrderStatus.pending.value,
    OrderStatus.preparing.value,
    OrderStatus.ready.value,
]


class PaymentsNotConfigured(Exception):
    pass


def money(value: float) -> Decimal:
    """Rupees rounded to paise, half-up (how the amount is shown and paid)."""
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def items_fingerprint(items: List[Any]) -> str:
    dumped = [i.model_dump() if isinstance(i, BillItem) else BillItem(**i).model_dump() for i in items]
    return hashlib.sha256(json.dumps(dumped, sort_keys=True).encode()).hexdigest()


def make_reference(table_name: Optional[str]) -> str:
    """Short alphanumeric reference, e.g. "T4-8F2A1C" (UPI ``tr`` allows up to 35)."""
    tag = "".join(ch for ch in (table_name or "") if ch.isalnum()).upper()[:8]
    prefix = f"T{tag}" if tag else "TA"  # TA = take-away / counter
    return f"{prefix}-{secrets.token_hex(3).upper()}"


async def load_settings(db, cafe_id: str) -> Optional[dict]:
    return await db.payment_settings.find_one({"cafe_id": cafe_id}, {"_id": 0})


def gateway_config(settings_doc: dict) -> GatewayConfig:
    enc = settings_doc.get("webhook_secret_enc") or ""
    return GatewayConfig(
        merchant_id=settings_doc.get("merchant_id", ""),
        vpa=settings_doc.get("vpa", ""),
        payee_name=settings_doc.get("payee_name", ""),
        secret=decrypt_secret(enc) if enc else "",
    )


async def _table_name(db, table_id: Optional[str]) -> Optional[str]:
    if not table_id:
        return None
    t = await db.tables.find_one({"id": table_id}, {"_id": 0, "name": 1})
    return t.get("name") if t else None


# ---- Dynamic QR -------------------------------------------------------------


async def create_payment_request(
    db, cafe_id: str, gateway: PaymentGateway, config: GatewayConfig, payload: PaymentRequestCreate
) -> PaymentRequest:
    cafe = await db.cafes.find_one({"id": cafe_id}, {"_id": 0}) or {}
    amount = float(money(compute_totals(
        cafe, payload.items, None, payload.packing_charge, payload.delivery_charge
    )["total"]))

    fingerprint = None
    if payload.order_id:
        order = await db.orders.find_one({"id": payload.order_id, "cafe_id": cafe_id}, {"_id": 0, "items": 1})
        if order:
            fingerprint = items_fingerprint(order.get("items", []))

    # One live QR per table/order: a fresh QR (e.g. after adding an item)
    # supersedes the old one, so a late payment on the old QR goes to review.
    scope = {"order_id": payload.order_id} if payload.order_id else (
        {"table_id": payload.table_id} if payload.table_id else None
    )
    if scope:
        await db.payment_requests.update_many(
            {"cafe_id": cafe_id, "status": PaymentRequestStatus.pending.value, **scope},
            {"$set": {"status": PaymentRequestStatus.cancelled.value}},
        )

    reference = make_reference(await _table_name(db, payload.table_id))
    request = PaymentRequest(
        cafe_id=cafe_id,
        reference=reference,
        provider=gateway.name,
        table_id=payload.table_id,
        order_id=payload.order_id,
        amount=amount,
        qr_payload=await gateway.create_dynamic_qr(config, reference, amount),
        items=payload.items,
        packing_charge=payload.packing_charge,
        delivery_charge=payload.delivery_charge,
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        order_fingerprint=fingerprint,
    )
    await db.payment_requests.insert_one(to_mongo(request))
    return request


# ---- Matching -----------------------------------------------------------------


@dataclass
class Candidate:
    table_id: Optional[str]
    order_id: Optional[str]
    amount: float
    request: Optional[dict] = None
    order: Optional[dict] = None


async def open_bill_candidates(db, cafe_id: str) -> List[Candidate]:
    """Every bill that is waiting to be paid: live QR requests first, then open
    dine-in orders that have no live QR (amount computed exactly as a settle would)."""
    cafe = await db.cafes.find_one({"id": cafe_id}, {"_id": 0}) or {}
    candidates: List[Candidate] = []
    covered_orders: set[str] = set()
    covered_tables: set[str] = set()

    async for req in db.payment_requests.find(
        {"cafe_id": cafe_id, "status": PaymentRequestStatus.pending.value}, {"_id": 0}
    ):
        candidates.append(Candidate(req.get("table_id"), req.get("order_id"), req["amount"], request=req))
        if req.get("order_id"):
            covered_orders.add(req["order_id"])
        if req.get("table_id"):
            covered_tables.add(req["table_id"])

    async for order in db.orders.find(
        {"cafe_id": cafe_id, "status": {"$in": _OPEN_ORDER}, "table_id": {"$ne": None}}, {"_id": 0}
    ):
        if order["id"] in covered_orders or order["table_id"] in covered_tables:
            continue
        items = [BillItem(**i) for i in order.get("items", [])]
        total = compute_totals(cafe, items)["total"]
        candidates.append(Candidate(order["table_id"], order["id"], total, order=order))
    return candidates


async def _settle_candidate(db, cafe_id: str, cand: Candidate, bill_id: str) -> Bill:
    if cand.request:
        r = cand.request
        payload = BillCreate(
            id=bill_id,
            table_id=r.get("table_id"),
            order_id=r.get("order_id"),
            items=r["items"],
            packing_charge=r.get("packing_charge", 0.0),
            delivery_charge=r.get("delivery_charge", 0.0),
            payment_method=PaymentMethod.upi,
            customer_name=r.get("customer_name"),
            customer_phone=r.get("customer_phone"),
        )
    else:
        payload = BillCreate(
            id=bill_id,
            table_id=cand.table_id,
            order_id=cand.order_id,
            items=cand.order.get("items", []),
            payment_method=PaymentMethod.upi,
        )
    return await settle_bill(db, cafe_id, payload)


async def _claim_request(db, request_id: str, payment: dict) -> Optional[dict]:
    """Atomically move a request pending → paid; None if someone else got it."""
    return await db.payment_requests.find_one_and_update(
        {"id": request_id, "status": PaymentRequestStatus.pending.value},
        {"$set": {
            "status": PaymentRequestStatus.paid.value,
            "transaction_id": payment["transaction_id"],
            "paid_at": datetime.now(timezone.utc).isoformat(),
        }},
        return_document=ReturnDocument.AFTER,
    )


async def _claim_order(db, order_id: str, payment_id: str) -> bool:
    """Guard against two webhooks settling the same open order concurrently."""
    res = await db.orders.update_one(
        {"id": order_id, "status": {"$in": _OPEN_ORDER}, "upi_payment_id": None},
        {"$set": {"upi_payment_id": payment_id}},
    )
    return res.modified_count == 1


async def _mark_settled(db, payment: dict, cand: Candidate, bill: Bill, resolved_by: Optional[str] = None) -> dict:
    update = {
        "status": PaymentStatus.settled.value,
        "table_id": cand.table_id,
        "bill_id": bill.id,
        "payment_request_id": cand.request["id"] if cand.request else None,
        "review_reason": None,
    }
    if resolved_by:
        update["resolved_by"] = resolved_by
    await db.payments.update_one({"id": payment["id"]}, {"$set": update})
    if cand.request:
        await db.payment_requests.update_one({"id": cand.request["id"]}, {"$set": {"bill_id": bill.id}})
    payment = {**payment, **update}
    events.publish(payment["cafe_id"], "payment_settled", {
        "payment_id": payment["id"],
        "payment_request_id": update["payment_request_id"],
        "table_id": cand.table_id,
        "table_name": await _table_name(db, cand.table_id),
        "amount": payment["amount"],
        "bill_id": bill.id,
    })
    return payment


async def _needs_review(db, payment: dict, reason: str, candidates: List[Candidate]) -> dict:
    table_ids = list(dict.fromkeys(c.table_id for c in candidates if c.table_id))
    update = {
        "status": PaymentStatus.needs_review.value,
        "review_reason": reason,
        "candidate_table_ids": table_ids,
    }
    await db.payments.update_one({"id": payment["id"]}, {"$set": update})
    payment = {**payment, **update}
    events.publish(payment["cafe_id"], "payment_needs_review", {
        "payment_id": payment["id"],
        "amount": payment["amount"],
        "reason": reason,
        "candidate_table_ids": table_ids,
    })
    logger.info("UPI payment %s needs review: %s", payment["transaction_id"], reason)
    return payment


async def _apply_reference(db, payment: dict) -> dict:
    cafe_id = payment["cafe_id"]
    req = await db.payment_requests.find_one(
        {"cafe_id": cafe_id, "reference": payment["reference"]}, {"_id": 0}
    )
    if not req:
        return await _needs_review(db, payment, "unknown_reference", [])
    cand = Candidate(req.get("table_id"), req.get("order_id"), req["amount"], request=req)
    if req["status"] != PaymentRequestStatus.pending.value:
        # Paid twice, or the QR was replaced / the bill was settled by hand.
        reason = "already_settled" if req["status"] == PaymentRequestStatus.paid.value else "stale_qr"
        return await _needs_review(db, payment, reason, [cand])
    if money(payment["amount"]) != money(req["amount"]):
        return await _needs_review(db, payment, "amount_mismatch", [cand])

    if req.get("order_id"):
        order = await db.orders.find_one({"id": req["order_id"]}, {"_id": 0})
        if not order or order.get("status") not in _OPEN_ORDER:
            return await _needs_review(db, payment, "already_settled", [cand])
        if req.get("order_fingerprint") and items_fingerprint(order.get("items", [])) != req["order_fingerprint"]:
            return await _needs_review(db, payment, "order_changed", [cand])

    claimed = await _claim_request(db, req["id"], payment)
    if not claimed:
        return await _needs_review(db, payment, "already_settled", [cand])
    cand.request = claimed
    bill = await _settle_candidate(db, cafe_id, cand, bill_id=req["id"])
    return await _mark_settled(db, payment, cand, bill)


async def _apply_amount_match(db, payment: dict) -> dict:
    cafe_id = payment["cafe_id"]
    paid = money(payment["amount"])
    matches = [c for c in await open_bill_candidates(db, cafe_id) if money(c.amount) == paid]
    if len(matches) != 1:
        return await _needs_review(db, payment, "multiple_matches" if matches else "no_match", matches)

    cand = matches[0]
    if cand.request:
        claimed = await _claim_request(db, cand.request["id"], payment)
        if not claimed:
            return await _needs_review(db, payment, "already_settled", [cand])
        cand.request = claimed
        bill_id = cand.request["id"]
    else:
        if not await _claim_order(db, cand.order_id, payment["id"]):
            return await _needs_review(db, payment, "already_settled", [cand])
        bill_id = payment["id"]
    bill = await _settle_candidate(db, cafe_id, cand, bill_id=bill_id)
    return await _mark_settled(db, payment, cand, bill)


async def process_notification(db, cafe_id: str, provider: str, notif: PaymentNotification) -> dict:
    """Record a verified notification and settle what it pays for.

    Returns the stored payment doc, with ``duplicate=True`` when the gateway
    re-delivered a transaction we already handled (gateways retry webhooks).
    """
    payment = Payment(
        cafe_id=cafe_id,
        provider=provider,
        transaction_id=notif.transaction_id,
        amount=notif.amount,
        reference=notif.reference,
        gateway_status=notif.status,
        paid_at=notif.paid_at,
        status=PaymentStatus.needs_review if notif.status == "SUCCESS" else PaymentStatus.ignored,
    )
    doc = to_mongo(payment)
    try:
        # Inserted before matching: if anything below fails, the money still
        # shows up for review instead of vanishing.
        await db.payments.insert_one(dict(doc))
    except DuplicateKeyError:
        existing = await db.payments.find_one(
            {"cafe_id": cafe_id, "provider": provider, "transaction_id": notif.transaction_id}, {"_id": 0}
        )
        return {**(existing or doc), "duplicate": True}

    if payment.status == PaymentStatus.ignored:
        return doc
    if notif.reference:
        return await _apply_reference(db, doc)
    return await _apply_amount_match(db, doc)


# ---- Staff resolution ----------------------------------------------------------


class AssignError(Exception):
    pass


async def assign_payment(db, cafe_id: str, payment_id: str, table_id: str, user_id: Optional[str]) -> dict:
    """Staff picked the table for a payment we couldn't match on our own."""
    cand = next((c for c in await open_bill_candidates(db, cafe_id) if c.table_id == table_id), None)
    if not cand:
        raise AssignError("That table has no open bill to settle.")

    payment = await db.payments.find_one_and_update(
        {"id": payment_id, "cafe_id": cafe_id, "status": PaymentStatus.needs_review.value},
        {"$set": {"status": PaymentStatus.settled.value, "table_id": table_id}},
        return_document=ReturnDocument.AFTER,
    )
    if not payment:
        raise AssignError("This payment was already handled.")
    payment.pop("_id", None)

    if cand.request:
        claimed = await _claim_request(db, cand.request["id"], payment)
        if not claimed:
            # The bill got paid between listing and assigning; put the payment back.
            await db.payments.update_one(
                {"id": payment_id}, {"$set": {"status": PaymentStatus.needs_review.value, "table_id": None}}
            )
            raise AssignError("That table's bill was just settled.")
        cand.request = claimed
        bill_id = claimed["id"]
    else:
        bill_id = payment["id"]
    bill = await _settle_candidate(db, cafe_id, cand, bill_id=bill_id)
    return await _mark_settled(db, payment, cand, bill, resolved_by=user_id)
