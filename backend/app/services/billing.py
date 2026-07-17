"""Billing helpers: atomic per-cafe bill numbers and the immutability hash."""
import hashlib
import json
from datetime import datetime
from typing import List

from pymongo import ReturnDocument

from app.models.bill import BillItem


def calculate_bill_hash(bill_number: int, items: List[BillItem], total: float, timestamp: datetime) -> str:
    """SHA-256 tamper hash over the bill's immutable content."""
    content = (
        f"{bill_number}|"
        f"{json.dumps([item.model_dump() for item in items], sort_keys=True)}|"
        f"{total}|{timestamp.isoformat()}"
    )
    return hashlib.sha256(content.encode()).hexdigest()


async def next_bill_number(db, cafe_id: str) -> int:
    """Return the next bill number for a cafe atomically.

    Uses a dedicated ``counters`` document per cafe with ``$inc`` so concurrent
    bill creation can never hand out the same number. The counter is seeded from
    any pre-existing bills the first time it is used, and the unique
    ``(cafe_id, bill_number)`` index is the final backstop against collisions.
    """
    key = f"bill_number:{cafe_id}"
    counter = await db.counters.find_one({"_id": key})
    if counter is None:
        last = await db.bills.find_one({"cafe_id": cafe_id}, sort=[("bill_number", -1)])
        start = last["bill_number"] if last else 0
        await db.counters.update_one(
            {"_id": key}, {"$setOnInsert": {"seq": start}}, upsert=True
        )

    doc = await db.counters.find_one_and_update(
        {"_id": key},
        {"$inc": {"seq": 1}},
        return_document=ReturnDocument.AFTER,
    )
    return doc["seq"]
