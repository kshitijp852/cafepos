from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user
from app.db.mongo import db
from app.db.serialization import to_mongo
from app.models.common import SessionStatus
from app.models.session import DaySession, DaySessionClose, DaySessionOpen

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/current", response_model=Optional[DaySession])
async def get_current_session(current_user: dict = Depends(get_current_user)):
    today = date.today().isoformat()
    return await db.day_sessions.find_one(
        {"cafe_id": current_user["cafe_id"], "session_date": today, "status": SessionStatus.open.value},
        {"_id": 0},
    )


@router.post("/open", response_model=DaySession)
async def open_day_session(payload: DaySessionOpen, current_user: dict = Depends(get_current_user)):
    cafe_id = current_user["cafe_id"]
    today = date.today().isoformat()
    if await db.day_sessions.find_one(
        {"cafe_id": cafe_id, "session_date": today, "status": SessionStatus.open.value}
    ):
        raise HTTPException(status_code=400, detail="Session already open for today")

    session = DaySession(
        cafe_id=cafe_id,
        session_date=today,
        opening_cash=payload.opening_cash,
        expected_cash=payload.opening_cash,
    )
    await db.day_sessions.insert_one(to_mongo(session))
    return session


@router.post("/close", response_model=DaySession)
async def close_day_session(payload: DaySessionClose, current_user: dict = Depends(get_current_user)):
    session = await db.day_sessions.find_one({"id": payload.session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this session.")
    if session["status"] == SessionStatus.closed.value:
        raise HTTPException(status_code=400, detail="Session already closed")

    await db.day_sessions.update_one(
        {"id": payload.session_id},
        {"$set": {
            "closing_cash": payload.closing_cash,
            "closed_at": datetime.now(timezone.utc).isoformat(),
            "status": SessionStatus.closed.value,
        }},
    )
    return await db.day_sessions.find_one({"id": payload.session_id}, {"_id": 0})


@router.get("/history", response_model=List[DaySession])
async def get_session_history(current_user: dict = Depends(get_current_user)):
    return await db.day_sessions.find(
        {"cafe_id": current_user["cafe_id"]}, {"_id": 0}
    ).sort("session_date", -1).to_list(30)
