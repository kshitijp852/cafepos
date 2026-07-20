"""Owner profile: their own account details, password, and business identity."""
from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import require_role
from app.core.security import get_password_hash, verify_password
from app.db.mongo import db
from app.models.cafe import Cafe
from app.models.common import Role
from app.models.user import PasswordChange, ProfileUpdate, User

router = APIRouter(prefix="/profile", tags=["profile"])
_MANAGER = require_role([Role.owner.value, Role.superadmin.value])


async def _load(current_user: dict) -> tuple[dict, dict]:
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    cafe = await db.cafes.find_one({"id": current_user["cafe_id"]}, {"_id": 0})
    if not cafe:
        raise HTTPException(status_code=404, detail="Cafe not found.")
    return user, cafe


@router.get("")
async def get_profile(current_user: dict = Depends(_MANAGER)):
    """Account + business identity, plus whether GST is still outstanding."""
    user, cafe = await _load(current_user)
    return {
        "user": User(**user),
        "cafe": Cafe(**cafe),
        # Real accounts created before GST became mandatory still need to fill it in.
        "gst_required": not cafe.get("is_test_account") and not cafe.get("gst_number"),
    }


@router.patch("", response_model=User)
async def update_profile(payload: ProfileUpdate, current_user: dict = Depends(_MANAGER)):
    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        name = (updates["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty.")
        updates["name"] = name
    if updates:
        await db.users.update_one({"id": current_user["user_id"]}, {"$set": updates})
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0, "password": 0})
    return User(**user)


@router.post("/password")
async def change_password(payload: PasswordChange, current_user: dict = Depends(_MANAGER)):
    user = await db.users.find_one({"id": current_user["user_id"]})
    if not user or not verify_password(payload.current_password, user.get("password", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    await db.users.update_one(
        {"id": user["id"]}, {"$set": {"password": get_password_hash(payload.password)}}
    )
    # Any outstanding reset links are invalidated by a deliberate password change.
    await db.password_resets.delete_many({"user_id": user["id"]})
    return {"message": "Password updated."}
