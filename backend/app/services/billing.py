"""Billing helpers: atomic per-cafe bill numbers and the immutability hash."""
import hashlib
import json
from datetime import datetime
from typing import List

from pymongo import ReturnDocument

from app.models.bill import BillItem


def calculate_bill_hash(
    bill_number: int, items: List[BillItem], total: float, timestamp: datetime, series: str = ""
) -> str:
    """SHA-256 tamper hash over the bill's immutable content.

    ``series`` is included so the same integer sequence in two different device
    series (e.g. C-1 and B2-1) still hashes distinctly.
    """
    content = (
        f"{series}|{bill_number}|"
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
        # Seed only from the default ("") line — device series (C-*, B2-*) have
        # their own counters and must not bump the default line's next number.
        last = await db.bills.find_one(
            {"cafe_id": cafe_id, "series": {"$in": ["", None]}}, sort=[("bill_number", -1)]
        )
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


# ---- Per-device invoice serial series (offline-safe numbering) --------------
#
# Each billing device owns its own consecutive series (the bill_number counter),
# tagged with a short series_code prefix (e.g. "C", "B2"). GST permits multiple
# invoice series per shop as long as each series is consecutive and unique — so
# two devices never share a series and can therefore both settle bills offline
# without colliding. This is the invoice serial, NOT the shop's GSTIN.

_SERIES_MAX_SUFFIX = 1000


async def claim_series(db, cafe_id: str, preferred: str | None) -> str:
    """Reserve a unique series_code for a device within a cafe.

    Tries ``preferred`` (uppercased), then preferred2, preferred3, … until one is
    free, recording it in ``bill_series`` (unique on (cafe_id, series_code)).
    """
    base = "".join(ch for ch in (preferred or "").upper() if ch.isalnum())[:6] or "S"
    for i in range(_SERIES_MAX_SUFFIX):
        code = base if i == 0 else f"{base}{i + 1}"
        res = await db.bill_series.update_one(
            {"cafe_id": cafe_id, "series_code": code},
            {"$setOnInsert": {"cafe_id": cafe_id, "series_code": code, "seq": 0}},
            upsert=True,
        )
        if res.upserted_id is not None:
            return code
    raise ValueError("Could not allocate a bill series")


async def reserve_series_block(db, cafe_id: str, series_code: str, count: int) -> dict:
    """Atomically reserve ``count`` contiguous serials for a series.

    Returns ``{series_code, start, end}``. Because the per-series counter only
    ever moves forward under ``$inc``, blocks handed to different devices (or the
    same device on refill) never overlap, and one device's blocks stay contiguous
    (no gaps) as long as it exhausts a block before drawing the next.
    """
    count = max(1, int(count))
    doc = await db.bill_series.find_one_and_update(
        {"cafe_id": cafe_id, "series_code": series_code},
        {"$inc": {"seq": count}},
        return_document=ReturnDocument.AFTER,
        upsert=True,
    )
    end = doc["seq"]
    return {"series_code": series_code, "start": end - count + 1, "end": end}
