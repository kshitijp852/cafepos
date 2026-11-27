from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import MANAGEMENT
from app.db.mongo import db
from app.db.serialization import to_mongo
from app.models.common import Role
from app.models.user import StaffInvite, User, WaiterUpdate
from app.services.auth_otp import send_first_login_otp

router = APIRouter(tags=["staff"])

# Everyone an owner/manager can see and administer on the roster.
_ROSTER_ROLES = [Role.waiter.value, Role.kitchen.value, Role.manager.value]


def _guard_manager_boundary(current_user: dict, target: dict) -> None:
    """A manager can't create, edit, deactivate, reactivate, or delete another
    manager — only the owner can. Owner is unrestricted."""
    if current_user["role"] == Role.manager.value and target["role"] == Role.manager.value:
        raise HTTPException(status_code=403, detail="Managers can't manage other managers.")


async def _find_staff_or_404(staff_id: str, cafe_id: str) -> dict:
    staff = await db.users.find_one(
        {"id": staff_id, "cafe_id": cafe_id, "role": {"$in": _ROSTER_ROLES}}, {"_id": 0}
    )
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found.")
    return staff


# ---- Staff invite (replaces name-only roster creation) ----

@router.post("/staff")
async def create_staff(payload: StaffInvite, current_user: dict = Depends(MANAGEMENT)):
    """Invite a new staff member — one endpoint for every role. Creates the
    user row immediately (unverified, no password) and emails a first-login
    OTP right away; the invite itself is that user's first-login trigger."""
    if current_user["role"] == Role.manager.value and payload.role == Role.manager.value:
        raise HTTPException(status_code=403, detail="Managers can't add other managers.")

    if await db.users.find_one({"email": payload.email}):
        raise HTTPException(status_code=400, detail="Email already registered.")

    staff = User(
        email=payload.email, name=payload.name, role=payload.role,
        cafe_id=current_user["cafe_id"], is_email_verified=False,
        created_by=current_user.get("user_id"),
    )
    doc = to_mongo(staff)
    await db.users.insert_one(doc)
    otp = await send_first_login_otp(db, doc)

    resp = staff.model_dump(mode="json")
    if otp:  # DEV convenience: no mailbox required locally.
        resp["dev_otp"] = otp
    return resp


@router.post("/staff/{staff_id}/resend-invite")
async def resend_invite(staff_id: str, current_user: dict = Depends(MANAGEMENT)):
    """Re-send the first-login OTP if the original expired or got lost."""
    staff = await _find_staff_or_404(staff_id, current_user["cafe_id"])
    if staff.get("is_email_verified"):
        raise HTTPException(status_code=400, detail="This staff member has already signed in.")

    otp = await send_first_login_otp(db, staff)
    resp = {"message": "Invite re-sent."}
    if otp:
        resp["dev_otp"] = otp
    return resp


@router.get("/staff", response_model=List[User])
async def get_staff(current_user: dict = Depends(MANAGEMENT)):
    """List staff for the manager's cafe (active and deactivated)."""
    return await db.users.find(
        {"cafe_id": current_user["cafe_id"], "role": {"$in": _ROSTER_ROLES}}, {"_id": 0, "password": 0},
    ).to_list(1000)


@router.patch("/staff/{staff_id}", response_model=User)
async def update_staff(staff_id: str, payload: WaiterUpdate, current_user: dict = Depends(MANAGEMENT)):
    """Edit a staff roster entry's name."""
    staff = await _find_staff_or_404(staff_id, current_user["cafe_id"])
    _guard_manager_boundary(current_user, staff)

    updates: dict = {}
    if payload.name is not None and payload.name.strip():
        updates["name"] = payload.name.strip()
    if updates:
        await db.users.update_one({"id": staff_id}, {"$set": updates})

    return await db.users.find_one({"id": staff_id}, {"_id": 0, "password": 0})


@router.get("/staff/{staff_id}/stats")
async def staff_stats(staff_id: str, current_user: dict = Depends(MANAGEMENT)):
    """Per-staff analytics: orders taken, tables served, revenue, and recent bills."""
    cafe_id = current_user["cafe_id"]
    staff = await _find_staff_or_404(staff_id, cafe_id)

    orders = await db.orders.find({"cafe_id": cafe_id, "waiter_id": staff_id}, {"_id": 0}).to_list(10000)
    tables_served = {o["table_id"] for o in orders if o.get("table_id")}
    items_sold = sum(i.get("quantity", 0) for o in orders for i in o.get("items", []))

    bills = await db.bills.find(
        {"cafe_id": cafe_id, "waiter_id": staff_id, "soft_deleted": False}, {"_id": 0}
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


# ---- Staff lifecycle ----

@router.post("/staff/{staff_id}/deactivate")
async def deactivate_staff(staff_id: str, current_user: dict = Depends(MANAGEMENT)):
    """Soft-disable a staff member."""
    staff = await _find_staff_or_404(staff_id, current_user["cafe_id"])
    _guard_manager_boundary(current_user, staff)
    await db.users.update_one({"id": staff_id}, {"$set": {"is_active": False}})
    return {"message": "Staff member deactivated."}


@router.post("/staff/{staff_id}/activate")
async def reactivate_staff(staff_id: str, current_user: dict = Depends(MANAGEMENT)):
    """Re-enable a previously deactivated staff member."""
    staff = await _find_staff_or_404(staff_id, current_user["cafe_id"])
    _guard_manager_boundary(current_user, staff)
    await db.users.update_one({"id": staff_id}, {"$set": {"is_active": True}})
    return {"message": "Staff member reactivated."}


@router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str, current_user: dict = Depends(MANAGEMENT)):
    """Delete a staff member."""
    staff = await _find_staff_or_404(staff_id, current_user["cafe_id"])
    _guard_manager_boundary(current_user, staff)
    await db.users.delete_one({"id": staff_id})
    return {"message": "Staff member deleted."}
