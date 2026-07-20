"""Index creation, run once at startup.

The unique ``(cafe_id, bill_number)`` index is the safety net that makes bill
numbering collision-proof even if two bills are created concurrently.
"""
import logging

from pymongo import ASCENDING, DESCENDING

logger = logging.getLogger("cafepos")

_INDEXES = [
    ("users", [("email", ASCENDING)], {"unique": True}),
    # Staff log in by username. Partial (string-only) so the many manager rows
    # that store username=null don't collide on a unique index.
    ("users", [("username", ASCENDING)], {
        "unique": True,
        "partialFilterExpression": {"username": {"$type": "string"}},
    }),
    ("users", [("cafe_id", ASCENDING), ("role", ASCENDING)], {}),
    # Unique per (cafe, series, serial): each device series is its own consecutive
    # invoice line, so C-1 and B2-1 coexist while duplicates within a series can't.
    ("bills", [("cafe_id", ASCENDING), ("series", ASCENDING), ("bill_number", ASCENDING)], {"unique": True}),
    ("bills", [("cafe_id", ASCENDING), ("created_at", DESCENDING)], {}),
    # Per-device invoice-serial series registry + counters.
    ("bill_series", [("cafe_id", ASCENDING), ("series_code", ASCENDING)], {"unique": True}),
    ("orders", [("cafe_id", ASCENDING), ("status", ASCENDING)], {}),
    ("categories", [("cafe_id", ASCENDING)], {}),
    ("menu_items", [("cafe_id", ASCENDING), ("category_id", ASCENDING)], {}),
    ("floors", [("cafe_id", ASCENDING)], {}),
    ("tables", [("cafe_id", ASCENDING)], {}),
    ("reservations", [("cafe_id", ASCENDING), ("reservation_date", ASCENDING)], {}),
    ("day_sessions", [("cafe_id", ASCENDING), ("session_date", ASCENDING)], {}),
    ("inventory", [("cafe_id", ASCENDING)], {}),
    ("device_sessions", [("device_id", ASCENDING)], {}),
    # Waiter device-authorization records.
    ("device_activations", [("user_id", ASCENDING), ("device_id", ASCENDING)], {"unique": True}),
    ("device_activations", [("code", ASCENDING)], {}),
    ("device_activations", [("expires_at", ASCENDING)], {"expireAfterSeconds": 0}),
    # Signup/reset ephemeral records. TTL indexes (expireAfterSeconds=0) let
    # Mongo auto-purge expired docs — requires expires_at stored as a BSON date.
    ("pending_registrations", [("email", ASCENDING)], {"unique": True}),
    ("pending_registrations", [("expires_at", ASCENDING)], {"expireAfterSeconds": 0}),
    ("password_resets", [("token_hash", ASCENDING)], {}),
    ("password_resets", [("expires_at", ASCENDING)], {"expireAfterSeconds": 0}),
    # OTP challenges gating sensitive in-app actions (one live per user+purpose).
    ("action_otps", [("user_id", ASCENDING), ("purpose", ASCENDING)], {"unique": True}),
    ("action_otps", [("expires_at", ASCENDING)], {"expireAfterSeconds": 0}),
]


async def ensure_indexes(db) -> None:
    await _migrate_bill_series(db)
    for collection, keys, opts in _INDEXES:
        try:
            await db[collection].create_index(keys, **opts)
        except Exception as exc:  # pragma: no cover - defensive, logged not fatal
            logger.warning("Could not create index on %s %s: %s", collection, keys, exc)


async def _migrate_bill_series(db) -> None:
    """Prepare bills for the (cafe_id, series, bill_number) unique index.

    Backfills the new ``series`` field to "" on legacy bills so old and new rows
    share one index key space, and drops the old (cafe_id, bill_number) unique
    index which would otherwise reject a series-prefixed collision-free number.
    """
    try:
        await db.bills.update_many({"series": {"$exists": False}}, {"$set": {"series": ""}})
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Bill series backfill failed: %s", exc)
    try:
        await db.bills.drop_index("cafe_id_1_bill_number_1")
    except Exception:  # index may not exist (fresh db) — fine
        pass
