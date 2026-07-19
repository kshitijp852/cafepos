from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user
from app.db.mongo import db
from app.models.cafe import Cafe

router = APIRouter(tags=["cafe"])


@router.get("/cafe", response_model=Cafe)
async def get_cafe(current_user: dict = Depends(get_current_user)):
    """The current user's cafe (name shown in the app header, tax rate, etc.)."""
    cafe = await db.cafes.find_one({"id": current_user["cafe_id"]}, {"_id": 0})
    if not cafe:
        raise HTTPException(status_code=404, detail="Cafe not found.")
    return cafe
