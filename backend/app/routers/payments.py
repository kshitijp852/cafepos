"""UPI auto-settlement: gateway settings, dynamic-QR payment requests, the
gateway webhook, and the staff review queue for payments we couldn't match."""
import json
import secrets
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pymongo import ReturnDocument

from app.core.deps import require_role, require_user_session
from app.core.security import encrypt_secret
from app.db.mongo import db
from app.models.payment import (
    MockPaymentSimulate,
    Payment,
    PaymentAssign,
    PaymentDismiss,
    PaymentRequest,
    PaymentRequestCreate,
    PaymentRequestStatus,
    PaymentSettingsUpdate,
    PaymentStatus,
)
from app.services.payments.gateways import GATEWAYS, InvalidNotification, MockGateway, get_gateway
from app.services.payments.reconcile import (
    AssignError,
    assign_payment,
    create_payment_request,
    gateway_config,
    load_settings,
    process_notification,
)

router = APIRouter(prefix="/payments", tags=["payments"])

_OWNER = require_role(["owner", "superadmin"])


def _settings_view(doc: Optional[dict], cafe_id: str) -> dict:
    doc = doc or {}
    provider = doc.get("provider", "mock")
    return {
        "enabled": doc.get("enabled", False),
        "provider": provider,
        "providers": sorted(GATEWAYS),
        "merchant_id": doc.get("merchant_id", ""),
        "vpa": doc.get("vpa", ""),
        "payee_name": doc.get("payee_name", ""),
        "webhook_secret_set": bool(doc.get("webhook_secret_enc")),
        # Path to register on the gateway's merchant dashboard (prefix with the
        # backend's public URL).
        "webhook_path": f"/api/payments/webhook/{provider}/{cafe_id}",
    }


async def _active_settings(cafe_id: str) -> dict:
    doc = await load_settings(db, cafe_id)
    if not doc or not doc.get("enabled"):
        raise HTTPException(status_code=400, detail="UPI auto-settle isn't turned on. Set it up in Settings.")
    return doc


# ---- Settings (owner) ---------------------------------------------------------


@router.get("/settings")
async def get_payment_settings(current_user: dict = Depends(require_user_session)):
    # Any signed-in user may read (the Settle dialog needs `enabled`); the
    # secret itself is never returned.
    return _settings_view(await load_settings(db, current_user["cafe_id"]), current_user["cafe_id"])


@router.put("/settings")
async def update_payment_settings(payload: PaymentSettingsUpdate, current_user: dict = Depends(_OWNER)):
    cafe_id = current_user["cafe_id"]
    current = await load_settings(db, cafe_id) or {}
    update = payload.model_dump(exclude_unset=True, exclude={"webhook_secret"})
    for key in ("merchant_id", "vpa", "payee_name"):
        if key in update:
            update[key] = (update[key] or "").strip()

    provider = update.get("provider", current.get("provider", "mock"))
    if provider not in GATEWAYS:
        raise HTTPException(status_code=400, detail=f"Unknown payment provider '{provider}'.")
    update["provider"] = provider

    if payload.webhook_secret:
        update["webhook_secret_enc"] = encrypt_secret(payload.webhook_secret.strip())
    elif not current.get("webhook_secret_enc"):
        # The mock gateway signs its own simulated webhooks, so give it a secret
        # out of the box. A real gateway's secret comes from its dashboard.
        update["webhook_secret_enc"] = encrypt_secret(secrets.token_urlsafe(32))

    merged = {**current, **update}
    if merged.get("enabled") and not merged.get("vpa"):
        raise HTTPException(status_code=400, detail="Enter the UPI ID that customers should pay to.")

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.payment_settings.update_one(
        {"cafe_id": cafe_id}, {"$set": update, "$setOnInsert": {"cafe_id": cafe_id}}, upsert=True
    )
    return _settings_view(await load_settings(db, cafe_id), cafe_id)


# ---- Dynamic QR payment requests ------------------------------------------------


@router.post("/requests", response_model=PaymentRequest)
async def create_request(payload: PaymentRequestCreate, current_user: dict = Depends(require_user_session)):
    if not payload.items:
        raise HTTPException(status_code=400, detail="Add items first.")
    cafe_id = current_user["cafe_id"]
    doc = await _active_settings(cafe_id)
    gateway = get_gateway(doc.get("provider", "mock"))
    if not gateway:
        raise HTTPException(status_code=400, detail="The configured payment provider isn't available.")
    return await create_payment_request(db, cafe_id, gateway, gateway_config(doc), payload)


@router.get("/requests/{request_id}", response_model=PaymentRequest)
async def get_request(request_id: str, current_user: dict = Depends(require_user_session)):
    req = await db.payment_requests.find_one(
        {"id": request_id, "cafe_id": current_user["cafe_id"]}, {"_id": 0}
    )
    if not req:
        raise HTTPException(status_code=404, detail="Payment request not found.")
    return req


@router.post("/requests/{request_id}/cancel")
async def cancel_request(request_id: str, current_user: dict = Depends(require_user_session)):
    res = await db.payment_requests.update_one(
        {"id": request_id, "cafe_id": current_user["cafe_id"], "status": PaymentRequestStatus.pending.value},
        {"$set": {"status": PaymentRequestStatus.cancelled.value}},
    )
    return {"cancelled": res.modified_count == 1}


# ---- Gateway webhook (no auth header: verified by signature) --------------------


async def handle_webhook(provider: str, cafe_id: str, raw: bytes, headers) -> dict:
    gateway = get_gateway(provider)
    doc = await load_settings(db, cafe_id)
    if not gateway or not doc or doc.get("provider") != provider:
        raise HTTPException(status_code=404, detail="Unknown webhook.")
    config = gateway_config(doc)
    if not gateway.verify_signature(raw, headers, config.secret):
        raise HTTPException(status_code=401, detail="Invalid signature.")
    try:
        notif = gateway.parse_notification(raw)
    except InvalidNotification:
        raise HTTPException(status_code=400, detail="Malformed payment notification.")
    payment = await process_notification(db, cafe_id, provider, notif)
    return {
        "payment_id": payment["id"],
        "status": payment["status"],
        "duplicate": payment.get("duplicate", False),
    }


@router.post("/webhook/{provider}/{cafe_id}")
async def payment_webhook(provider: str, cafe_id: str, request: Request):
    # Verify against the exact bytes received — re-serialised JSON would not
    # match the gateway's signature.
    raw = await request.body()
    return await handle_webhook(provider, cafe_id, raw, request.headers)


@router.post("/mock/simulate")
async def simulate_mock_payment(payload: MockPaymentSimulate, current_user: dict = Depends(_OWNER)):
    """Dev/demo only: send a signed mock webhook through the real pipeline, as if
    a customer had paid. Refused unless the cafe is on the mock provider."""
    cafe_id = current_user["cafe_id"]
    doc = await _active_settings(cafe_id)
    if doc.get("provider") != "mock":
        raise HTTPException(status_code=400, detail="Simulated payments are only available on the mock provider.")
    body = {
        "merchantId": doc.get("merchant_id") or "MOCK",
        "transactionId": payload.transaction_id or f"MOCK_{secrets.token_hex(6).upper()}",
        "amount": payload.amount,
        "status": "SUCCESS",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if payload.reference:
        body["reference"] = payload.reference
    raw = json.dumps(body).encode()
    gateway: MockGateway = GATEWAYS["mock"]  # type: ignore[assignment]
    return await handle_webhook("mock", cafe_id, raw, gateway.sign(raw, gateway_config(doc).secret))


# ---- Review queue ------------------------------------------------------------------


@router.get("", response_model=List[Payment])
async def list_payments(
    status: Optional[PaymentStatus] = None,
    limit: int = 50,
    current_user: dict = Depends(require_user_session),
):
    query = {"cafe_id": current_user["cafe_id"]}
    if status:
        query["status"] = status.value
    return await db.payments.find(query, {"_id": 0}).sort("received_at", -1).to_list(limit)


@router.post("/{payment_id}/assign", response_model=Payment)
async def assign(payment_id: str, payload: PaymentAssign, current_user: dict = Depends(require_user_session)):
    try:
        return await assign_payment(
            db, current_user["cafe_id"], payment_id, payload.table_id, current_user.get("user_id")
        )
    except AssignError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/{payment_id}/dismiss", response_model=Payment)
async def dismiss(payment_id: str, payload: PaymentDismiss, current_user: dict = Depends(require_user_session)):
    """Close a payment without settling a table (e.g. refunded, a tip, or
    settled some other way). The record is kept for audit."""
    res = await db.payments.find_one_and_update(
        {"id": payment_id, "cafe_id": current_user["cafe_id"], "status": PaymentStatus.needs_review.value},
        {"$set": {
            "status": PaymentStatus.dismissed.value,
            "note": (payload.note or "").strip() or None,
            "resolved_by": current_user.get("user_id"),
        }},
        return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=409, detail="This payment was already handled.")
    res.pop("_id", None)
    return res
