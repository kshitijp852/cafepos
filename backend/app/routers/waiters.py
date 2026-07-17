import re
from datetime import timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import get_settings
from app.core.deps import require_role
from app.core.security import (
    create_access_token,
    create_refresh_token,
    generate_device_code,
    get_password_hash,
    is_expired,
    normalize_device_code,
    verify_password,
)
from app.db.mongo import db
from app.db.serialization import to_mongo
from app.models.common import Role, utcnow
from app.models.user import (
    DeviceActivate,
    DeviceActivation,
    DeviceCodeRequest,
    DevicePoll,
    User,
    WaiterCreate,
    WaiterLogin,
)

router = APIRouter(tags=["waiters"])
settings = get_settings()

STAFF_ROLES = [Role.staff.value, "waiter"]  # accept legacy "waiter" role
_MANAGER = require_role([Role.owner.value, Role.superadmin.value])


def _issue_tokens(user_doc: dict) -> dict:
    waiter = User(**user_doc)
    return {
        "status": "active",
        "user": waiter,
        "token": create_access_token(waiter.id, waiter.cafe_id, waiter.role),
        "refresh_token": create_refresh_token(waiter.id, waiter.cafe_id, waiter.role),
    }


def _grouped(code: str) -> str:
    """Format a normalized code as XXXX-XXXX-XXXX for display."""
    return "-".join(code[i:i + 4] for i in range(0, len(code), 4))


async def _unique_username(name: str, provided: str | None) -> str:
    """Slugify the name (or use a provided handle) and append a numeric suffix
    until it's free: 'Rahul Kumar' -> 'rahulkumar', then 'rahulkumar1', ..."""
    base = re.sub(r"[^a-z0-9]", "", (provided or name).lower()) or "staff"
    candidate = base
    suffix = 0
    while await db.users.find_one({"username": candidate}):
        suffix += 1
        candidate = f"{base}{suffix}"
    return candidate


@router.post("/waiters", response_model=User)
async def create_waiter(payload: WaiterCreate, current_user: dict = Depends(_MANAGER)):
    """Create a staff login (username + password). cafe_id comes from the manager's JWT."""
    cafe_id = current_user["cafe_id"]
    username = await _unique_username(payload.name, payload.username)

    waiter = User(
        email=f"{username}@staff.local",  # satisfies the unique-email index; not used to log in
        username=username,
        name=payload.name,
        role=Role.staff.value,
        cafe_id=cafe_id,
        created_by=current_user.get("user_id"),
    )
    doc = to_mongo(waiter)
    doc["password"] = get_password_hash(payload.password)
    await db.users.insert_one(doc)
    return waiter


@router.get("/waiters", response_model=List[User])
async def get_waiters(current_user: dict = Depends(_MANAGER)):
    """List staff for the manager's cafe (active and deactivated)."""
    return await db.users.find(
        {"cafe_id": current_user["cafe_id"], "role": {"$in": STAFF_ROLES}},
        {"_id": 0, "password": 0, "pin": 0},
    ).to_list(1000)


@router.get("/waiters/{waiter_id}/stats")
async def waiter_stats(waiter_id: str, current_user: dict = Depends(_MANAGER)):
    """Per-staff analytics: orders taken, tables served, revenue, and recent bills."""
    cafe_id = current_user["cafe_id"]
    staff = await db.users.find_one(
        {"id": waiter_id, "cafe_id": cafe_id, "role": {"$in": STAFF_ROLES}},
        {"_id": 0, "password": 0, "pin": 0},
    )
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found.")

    orders = await db.orders.find({"cafe_id": cafe_id, "waiter_id": waiter_id}, {"_id": 0}).to_list(10000)
    tables_served = {o["table_id"] for o in orders if o.get("table_id")}
    items_sold = sum(i.get("quantity", 0) for o in orders for i in o.get("items", []))

    bills = await db.bills.find(
        {"cafe_id": cafe_id, "waiter_id": waiter_id, "soft_deleted": False}, {"_id": 0}
    ).sort("bill_number", -1).to_list(10000)
    revenue = sum(b.get("total", 0) for b in bills)

    payment_breakdown: dict[str, float] = {}
    item_counts: dict[str, int] = {}
    for b in bills:
        payment_breakdown[b["payment_method"]] = payment_breakdown.get(b["payment_method"], 0.0) + b["total"]
        for it in b.get("items", []):
            item_counts[it["menu_item_name"]] = item_counts.get(it["menu_item_name"], 0) + it["quantity"]

    recent = [
        {
            "id": b["id"],
            "bill_number": b["bill_number"],
            "total": b["total"],
            "payment_method": b["payment_method"],
            "table_id": b.get("table_id"),
            "created_at": b["created_at"],
            "item_count": sum(i["quantity"] for i in b.get("items", [])),
        }
        for b in bills[:15]
    ]

    return {
        "staff": staff,
        "orders_taken": len(orders),
        "tables_served": len(tables_served),
        "items_sold": items_sold,
        "bills_count": len(bills),
        "revenue": revenue,
        "avg_bill": (revenue / len(bills)) if bills else 0,
        "payment_breakdown": payment_breakdown,
        "top_items": sorted(item_counts.items(), key=lambda x: x[1], reverse=True)[:5],
        "recent_bills": recent,
        "last_active": staff.get("last_active"),
    }


@router.post("/waiters/login", response_model=None)
async def waiter_login(payload: WaiterLogin):
    """Waiter logs in with username + password on a device.

    If this device is already authorized for the account, real JWT tokens are
    issued. Otherwise a pending device-pairing code is returned (stable across
    repeated polls) for a manager to activate.
    """
    user = await db.users.find_one({"username": payload.username, "role": {"$in": STAFF_ROLES}})
    if not user or not verify_password(payload.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is deactivated.")

    active = await db.device_activations.find_one(
        {"user_id": user["id"], "device_id": payload.device_id, "status": "active"}
    )
    if active:
        return _issue_tokens(user)

    # Reuse an existing, non-expired pending code so the code shown on the device
    # stays stable while it polls; otherwise mint a fresh one.
    pending = await db.device_activations.find_one(
        {"user_id": user["id"], "device_id": payload.device_id, "status": "pending"}
    )
    if not pending or is_expired(pending["expires_at"]):
        if pending:
            await db.device_activations.delete_one({"_id": pending["_id"]})
        activation = DeviceActivation(
            user_id=user["id"],
            cafe_id=user["cafe_id"],
            device_id=payload.device_id,
            code=normalize_device_code(generate_device_code()),
            expires_at=utcnow() + timedelta(minutes=settings.device_code_expiry_minutes),
        )
        doc = to_mongo(activation)
        # Store expires_at as a real BSON date (not the ISO string jsonable_encoder
        # produces) so the TTL index works and is_expired can compare it.
        doc["expires_at"] = activation.expires_at
        await db.device_activations.insert_one(doc)
        code = activation.code
        expires_at = activation.expires_at
    else:
        code = pending["code"]
        expires_at = pending["expires_at"]

    return {"status": "pending", "code": _grouped(code), "expires_at": expires_at}


@router.post("/waiters/devices/request")
async def request_device_code(payload: DeviceCodeRequest):
    """Credential-less flow: a device gets a pairing code WITHOUT logging in. The
    record has no staff yet — the manager assigns one when activating the code."""
    pending = await db.device_activations.find_one(
        {"device_id": payload.device_id, "user_id": None, "status": "pending"}
    )
    if pending and not is_expired(pending["expires_at"]):
        return {"code": _grouped(pending["code"]), "expires_at": pending["expires_at"]}
    if pending:
        await db.device_activations.delete_one({"_id": pending["_id"]})

    activation = DeviceActivation(
        device_id=payload.device_id,
        code=normalize_device_code(generate_device_code()),
        expires_at=utcnow() + timedelta(minutes=settings.device_code_expiry_minutes),
    )
    doc = to_mongo(activation)
    doc["expires_at"] = activation.expires_at  # real BSON date for TTL + comparison
    await db.device_activations.insert_one(doc)
    return {"code": _grouped(activation.code), "expires_at": activation.expires_at}


@router.post("/waiters/devices/poll")
async def poll_device(payload: DevicePoll):
    """Credential-less flow: device polls with its code; once a manager has
    activated it (and assigned a staff member), tokens are returned."""
    code = normalize_device_code(payload.code)
    activation = await db.device_activations.find_one(
        {"device_id": payload.device_id, "code": code}
    )
    if not activation:
        raise HTTPException(status_code=404, detail="Unknown device code.")
    if activation["status"] == "active" and activation.get("user_id"):
        user = await db.users.find_one({"id": activation["user_id"]})
        if not user or not user.get("is_active", True):
            raise HTTPException(status_code=401, detail="Staff account is inactive.")
        return _issue_tokens(user)
    return {"status": "pending"}


@router.post("/waiters/devices/activate")
async def activate_device(payload: DeviceActivate, current_user: dict = Depends(_MANAGER)):
    """Manager authorizes a device by entering its code against a specific staff member.

    Works for both flows:
    - login flow: the code already carries a user_id — it must match the chosen staff.
    - credential-less flow: the code has no staff yet — this assigns the chosen staff.
    """
    waiter = await db.users.find_one(
        {"id": payload.waiter_id, "cafe_id": current_user["cafe_id"], "role": {"$in": STAFF_ROLES}},
        {"_id": 0},
    )
    if not waiter or not waiter.get("is_active", True):
        raise HTTPException(status_code=404, detail="Staff member not found or inactive.")

    code = normalize_device_code(payload.code)
    activation = await db.device_activations.find_one({"code": code, "status": "pending"})
    if not activation or is_expired(activation["expires_at"]):
        raise HTTPException(status_code=400, detail="Invalid or expired code.")
    # A code minted by one staff's login must not be redirected to a different staff.
    if activation.get("user_id") and activation["user_id"] != payload.waiter_id:
        raise HTTPException(status_code=400, detail="This code belongs to a different staff member.")

    # Avoid a unique-key clash if this (staff, device) was authorized before.
    await db.device_activations.delete_many(
        {"user_id": payload.waiter_id, "device_id": activation["device_id"], "id": {"$ne": activation["id"]}}
    )
    await db.device_activations.update_one(
        {"_id": activation["_id"]},
        {
            "$set": {
                "user_id": payload.waiter_id,
                "cafe_id": waiter["cafe_id"],
                "status": "active",
                "device_name": f"{waiter['name']}'s device",
                "activated_by": current_user.get("user_id"),
                "activated_at": utcnow().isoformat(),
            },
            "$unset": {"expires_at": ""},  # active rows must never be TTL-purged
        },
    )
    return {
        "success": True,
        "message": f"Device activated for {waiter['name']}.",
        "waiter": {"id": waiter["id"], "name": waiter["name"], "username": waiter.get("username")},
    }


@router.get("/waiters/devices", response_model=List[DeviceActivation])
async def list_devices(current_user: dict = Depends(_MANAGER)):
    return await db.device_activations.find(
        {"cafe_id": current_user["cafe_id"], "status": "active"}, {"_id": 0}
    ).to_list(1000)


@router.delete("/waiters/devices/{activation_id}")
async def revoke_device(activation_id: str, current_user: dict = Depends(_MANAGER)):
    result = await db.device_activations.delete_one(
        {"id": activation_id, "cafe_id": current_user["cafe_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found.")
    return {"message": "Device revoked."}


async def _find_staff_or_404(waiter_id: str, cafe_id: str) -> dict:
    staff = await db.users.find_one(
        {"id": waiter_id, "cafe_id": cafe_id, "role": {"$in": STAFF_ROLES}}, {"_id": 0}
    )
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found.")
    return staff


@router.post("/waiters/{waiter_id}/deactivate")
async def deactivate_waiter(waiter_id: str, current_user: dict = Depends(_MANAGER)):
    """Soft-disable a staff account: blocks login and revokes their devices, but
    keeps the record so it can be reactivated later."""
    await _find_staff_or_404(waiter_id, current_user["cafe_id"])
    await db.users.update_one({"id": waiter_id}, {"$set": {"is_active": False}})
    await db.device_activations.delete_many({"user_id": waiter_id})
    return {"message": "Staff member deactivated."}


@router.post("/waiters/{waiter_id}/activate")
async def reactivate_waiter(waiter_id: str, current_user: dict = Depends(_MANAGER)):
    """Re-enable a previously deactivated staff account."""
    await _find_staff_or_404(waiter_id, current_user["cafe_id"])
    await db.users.update_one({"id": waiter_id}, {"$set": {"is_active": True}})
    return {"message": "Staff member reactivated."}


@router.delete("/waiters/{waiter_id}")
async def delete_waiter(waiter_id: str, current_user: dict = Depends(_MANAGER)):
    """Permanently delete a staff account and all its device authorizations."""
    await _find_staff_or_404(waiter_id, current_user["cafe_id"])
    await db.users.delete_one({"id": waiter_id})
    await db.device_activations.delete_many({"user_id": waiter_id})
    return {"message": "Staff member deleted."}
