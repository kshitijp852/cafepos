from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.deps import MANAGEMENT, OWNER_ONLY, get_current_user
from app.core.email import action_otp_email, send_email
from app.core.security import generate_otp, get_password_hash, is_expired, verify_password
from app.db.mongo import db
from app.db.serialization import to_mongo
from app.models.common import Role, utcnow
from app.models.menu import Category, CategoryCreate, MenuItem, MenuItemCreate, PriceChangeRequest

router = APIRouter(prefix="/menu", tags=["menu"])
settings = get_settings()

_PURGE = "menu_purge"


class OtpConfirm(BaseModel):
    otp: str = Field(min_length=6, max_length=6)


# ---- Categories ----
@router.get("/categories", response_model=List[Category])
async def get_categories(limit: int = 200, skip: int = 0, current_user: dict = Depends(get_current_user)):
    return await db.categories.find(
        {"cafe_id": current_user["cafe_id"]}, {"_id": 0}
    ).skip(skip).to_list(limit)


@router.post("/categories", response_model=Category)
async def create_category(payload: CategoryCreate, current_user: dict = Depends(MANAGEMENT)):
    category = Category(name=payload.name, cafe_id=current_user["cafe_id"])
    await db.categories.insert_one(to_mongo(category))
    return category


@router.put("/categories/{category_id}", response_model=Category)
async def update_category(category_id: str, payload: CategoryCreate, current_user: dict = Depends(MANAGEMENT)):
    existing = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this category.")
    await db.categories.update_one({"id": category_id}, {"$set": {"name": payload.name}})
    return await db.categories.find_one({"id": category_id}, {"_id": 0})


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(MANAGEMENT)):
    existing = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this category.")
    await db.categories.delete_one({"id": category_id})
    return {"message": "Category deleted successfully."}


# ---- Menu items ----
@router.get("/items", response_model=List[MenuItem])
async def get_menu_items(limit: int = 500, skip: int = 0, current_user: dict = Depends(get_current_user)):
    return await db.menu_items.find(
        {"cafe_id": current_user["cafe_id"]}, {"_id": 0}
    ).skip(skip).to_list(limit)


@router.post("/items", response_model=MenuItem)
async def create_menu_item(payload: MenuItemCreate, current_user: dict = Depends(MANAGEMENT)):
    cafe_id = current_user["cafe_id"]
    if not await db.categories.find_one({"id": payload.category_id, "cafe_id": cafe_id}):
        raise HTTPException(status_code=404, detail="Category not found in your cafe.")
    item = MenuItem(**payload.model_dump(), cafe_id=cafe_id)
    await db.menu_items.insert_one(to_mongo(item))
    return item


@router.put("/items/{item_id}")
async def update_menu_item(item_id: str, payload: MenuItemCreate, current_user: dict = Depends(MANAGEMENT)):
    existing = await db.menu_items.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this menu item.")

    update = {**payload.model_dump(), "cafe_id": current_user["cafe_id"]}

    # A manager's price change is held for owner approval — the live price
    # isn't touched until it resolves. Every other field still applies at once.
    pending_price = current_user["role"] == Role.manager.value and payload.price != existing["price"]
    if pending_price:
        update.pop("price")
        request = PriceChangeRequest(
            cafe_id=current_user["cafe_id"],
            menu_item_id=item_id,
            current_price=existing["price"],
            proposed_price=payload.price,
            requested_by=current_user.get("user_id"),
        )
        await db.price_change_requests.insert_one(to_mongo(request))

    await db.menu_items.update_one({"id": item_id}, {"$set": update})
    item = await db.menu_items.find_one({"id": item_id}, {"_id": 0})
    if pending_price:
        item["price_change_status"] = "pending_approval"
    return item


@router.delete("/items/{item_id}")
async def delete_menu_item(item_id: str, current_user: dict = Depends(MANAGEMENT)):
    existing = await db.menu_items.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this menu item.")
    await db.menu_items.delete_one({"id": item_id})
    return {"message": "Item deleted successfully."}


# ---- Bulk delete (whole menu), gated by an email OTP ----
@router.post("/purge/request")
async def request_menu_purge(current_user: dict = Depends(MANAGEMENT)):
    """Email the manager a one-time code to confirm deleting the ENTIRE menu."""
    cafe_id = current_user["cafe_id"]
    item_count = await db.menu_items.count_documents({"cafe_id": cafe_id})
    if item_count == 0:
        raise HTTPException(status_code=400, detail="There is no menu to delete.")

    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    otp = generate_otp()
    await db.action_otps.replace_one(
        {"user_id": user["id"], "purpose": _PURGE},
        {
            "user_id": user["id"],
            "cafe_id": cafe_id,
            "purpose": _PURGE,
            "otp_hash": get_password_hash(otp),
            "attempts": 0,
            "expires_at": utcnow() + timedelta(minutes=settings.otp_expiry_minutes),
        },
        upsert=True,
    )

    subject, body = action_otp_email(user.get("name", "there"), otp, "delete your entire menu")
    await send_email(user["email"], subject, body)

    resp = {"message": "Confirmation code sent to your email.", "item_count": item_count}
    if not settings.email_configured:  # DEV convenience.
        resp["dev_otp"] = otp
    return resp


@router.post("/purge/confirm")
async def confirm_menu_purge(payload: OtpConfirm, current_user: dict = Depends(MANAGEMENT)):
    """Verify the code, then delete every menu item + category for this cafe."""
    cafe_id = current_user["cafe_id"]
    challenge = await db.action_otps.find_one({"user_id": current_user["user_id"], "purpose": _PURGE})
    if not challenge:
        raise HTTPException(status_code=400, detail="No pending delete. Please request a code first.")
    if is_expired(challenge["expires_at"]):
        await db.action_otps.delete_one({"_id": challenge["_id"]})
        raise HTTPException(status_code=400, detail="Code expired. Please request a new one.")
    if challenge.get("attempts", 0) >= settings.otp_max_attempts:
        await db.action_otps.delete_one({"_id": challenge["_id"]})
        raise HTTPException(status_code=429, detail="Too many attempts. Please request a new one.")

    if not verify_password(payload.otp, challenge["otp_hash"]):
        await db.action_otps.update_one({"_id": challenge["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid confirmation code.")

    items = await db.menu_items.delete_many({"cafe_id": cafe_id})
    cats = await db.categories.delete_many({"cafe_id": cafe_id})
    await db.action_otps.delete_one({"_id": challenge["_id"]})
    return {
        "message": "Menu deleted.",
        "deleted_items": items.deleted_count,
        "deleted_categories": cats.deleted_count,
    }


# ---- Price-change approval queue (manager proposes, owner resolves) ----

async def _find_price_request_or_404(request_id: str, cafe_id: str) -> dict:
    request = await db.price_change_requests.find_one(
        {"id": request_id, "cafe_id": cafe_id}, {"_id": 0}
    )
    if not request:
        raise HTTPException(status_code=404, detail="Price change request not found.")
    return request


@router.get("/price-requests", response_model=List[PriceChangeRequest])
async def list_price_requests(status: Optional[str] = None, current_user: dict = Depends(OWNER_ONLY)):
    query: dict = {"cafe_id": current_user["cafe_id"]}
    if status:
        query["status"] = status
    return await db.price_change_requests.find(query, {"_id": 0}).sort("requested_at", -1).to_list(1000)


@router.post("/price-requests/{request_id}/approve", response_model=PriceChangeRequest)
async def approve_price_request(request_id: str, current_user: dict = Depends(OWNER_ONLY)):
    cafe_id = current_user["cafe_id"]
    request = await _find_price_request_or_404(request_id, cafe_id)
    if request["status"] != "pending":
        raise HTTPException(status_code=400, detail="This request has already been resolved.")

    await db.menu_items.update_one(
        {"id": request["menu_item_id"], "cafe_id": cafe_id},
        {"$set": {"price": request["proposed_price"]}},
    )
    await db.price_change_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "approved", "resolved_by": current_user.get("user_id"), "resolved_at": utcnow()}},
    )
    return await db.price_change_requests.find_one({"id": request_id}, {"_id": 0})


@router.post("/price-requests/{request_id}/reject", response_model=PriceChangeRequest)
async def reject_price_request(request_id: str, current_user: dict = Depends(OWNER_ONLY)):
    """Stamps only — the item's price is untouched."""
    cafe_id = current_user["cafe_id"]
    request = await _find_price_request_or_404(request_id, cafe_id)
    if request["status"] != "pending":
        raise HTTPException(status_code=400, detail="This request has already been resolved.")

    await db.price_change_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "rejected", "resolved_by": current_user.get("user_id"), "resolved_at": utcnow()}},
    )
    return await db.price_change_requests.find_one({"id": request_id}, {"_id": 0})
