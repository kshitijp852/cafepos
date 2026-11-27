"""Self-service account page, open to every signed-in role: your own name, phone
and password. The cafe's business identity rides along read-only (exactly what
``GET /cafe`` already exposes); only ``PATCH /cafe`` (owner-only) changes it."""
from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user
from app.core.security import get_password_hash, verify_password
from app.db.mongo import db
from app.models.cafe import Cafe
from app.models.common import Role
from app.models.user import PasswordChange, ProfileUpdate, User

router = APIRouter(prefix="/profile", tags=["profile"])


async def _load(current_user: dict) -> tuple[dict, dict | None]:
    """The caller's user row and cafe. A platform admin belongs to no cafe, so
    their cafe is None rather than an error."""
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if current_user.get("cafe_id") is None:
        return user, None
    cafe = await db.cafes.find_one({"id": current_user["cafe_id"]}, {"_id": 0})
    if not cafe:
        raise HTTPException(status_code=404, detail="Cafe not found.")
    return user, cafe


@router.get("")
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Account + business identity, plus whether GST is still outstanding."""
    user, cafe = await _load(current_user)
    # Real accounts created before GST became mandatory still need to fill it in —
    # something only the owner can do, so nobody else is nagged about it.
    gst_required = (
        cafe is not None
        and user.get("role") == Role.owner.value
        and not cafe.get("is_test_account")
        and not cafe.get("gst_number")
    )
    return {
        "user": User(**user),
        "cafe": Cafe(**cafe) if cafe else None,
        "gst_required": gst_required,
    }


@router.patch("", response_model=User)
async def update_profile(payload: ProfileUpdate, current_user: dict = Depends(get_current_user)):
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
async def change_password(payload: PasswordChange, current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["user_id"]})
    if not user or not verify_password(payload.current_password, user.get("password", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    await db.users.update_one(
        {"id": user["id"]}, {"$set": {"password": get_password_hash(payload.password)}}
    )
    # Any outstanding reset links are invalidated by a deliberate password change.
    await db.password_resets.delete_many({"user_id": user["id"]})
    return {"message": "Password updated."}
