from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import PLATFORM_ADMIN
from app.db.mongo import db
from app.models.cafe import Cafe
from app.models.common import utcnow

router = APIRouter(prefix="/admin", tags=["admin"])


async def _find_cafe_or_404(cafe_id: str) -> dict:
    cafe = await db.cafes.find_one({"id": cafe_id}, {"_id": 0})
    if not cafe:
        raise HTTPException(status_code=404, detail="Cafe not found.")
    return cafe


@router.get("/cafes", response_model=List[Cafe])
async def list_cafes(status: Optional[str] = None, current_user: dict = Depends(PLATFORM_ADMIN)):
    """List cafes awaiting (or already past) approval. Unfiltered returns all."""
    query = {"status": status} if status else {}
    return await db.cafes.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.post("/cafes/{cafe_id}/approve", response_model=Cafe)
async def approve_cafe(cafe_id: str, current_user: dict = Depends(PLATFORM_ADMIN)):
    await _find_cafe_or_404(cafe_id)
    await db.cafes.update_one(
        {"id": cafe_id},
        {"$set": {"status": "approved", "approved_by": current_user["user_id"], "approved_at": utcnow()}},
    )
    return await db.cafes.find_one({"id": cafe_id}, {"_id": 0})


@router.post("/cafes/{cafe_id}/reject", response_model=Cafe)
async def reject_cafe(cafe_id: str, current_user: dict = Depends(PLATFORM_ADMIN)):
    """Reversible — the owner's account is untouched, so re-approving undoes this."""
    await _find_cafe_or_404(cafe_id)
    await db.cafes.update_one({"id": cafe_id}, {"$set": {"status": "rejected"}})
    return await db.cafes.find_one({"id": cafe_id}, {"_id": 0})
