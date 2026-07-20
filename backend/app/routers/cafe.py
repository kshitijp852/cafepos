from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user, require_role
from app.db.mongo import db
from app.models.cafe import Cafe, CafeSettingsUpdate
from app.models.common import Role

router = APIRouter(tags=["cafe"])
_MANAGER = require_role([Role.owner.value, Role.superadmin.value])


@router.get("/cafe", response_model=Cafe)
async def get_cafe(current_user: dict = Depends(get_current_user)):
    """The current user's cafe (name in header, tax split, charges)."""
    cafe = await db.cafes.find_one({"id": current_user["cafe_id"]}, {"_id": 0})
    if not cafe:
        raise HTTPException(status_code=404, detail="Cafe not found.")
    return cafe


@router.patch("/cafe", response_model=Cafe)
async def update_cafe(payload: CafeSettingsUpdate, current_user: dict = Depends(_MANAGER)):
    """Manager edits cafe name, tax split (CGST/SGST), and packing/delivery charges.
    tax_percentage is kept as CGST+SGST so order/bill math stays consistent."""
    cafe_id = current_user["cafe_id"]
    cafe = await db.cafes.find_one({"id": cafe_id}, {"_id": 0})
    if not cafe:
        raise HTTPException(status_code=404, detail="Cafe not found.")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates and not (updates["name"] or "").strip():
        raise HTTPException(status_code=400, detail="Cafe name cannot be empty.")
    if "name" in updates:
        updates["name"] = updates["name"].strip()
    # Optional text details: trim; empty -> cleared (null).
    for field in ("phone", "address", "gst_number"):
        if field in updates:
            updates[field] = (updates[field] or "").strip() or None

    # Recompute the combined tax rate whenever either component changes.
    if "cgst_percentage" in updates or "sgst_percentage" in updates:
        cgst = updates.get("cgst_percentage", cafe.get("cgst_percentage", 0))
        sgst = updates.get("sgst_percentage", cafe.get("sgst_percentage", 0))
        updates["tax_percentage"] = round(cgst + sgst, 4)

    if updates:
        await db.cafes.update_one({"id": cafe_id}, {"$set": updates})
    return await db.cafes.find_one({"id": cafe_id}, {"_id": 0})
