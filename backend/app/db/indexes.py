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
    ("bills", [("cafe_id", ASCENDING), ("bill_number", ASCENDING)], {"unique": True}),
    ("bills", [("cafe_id", ASCENDING), ("created_at", DESCENDING)], {}),
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
    for collection, keys, opts in _INDEXES:
        try:
            await db[collection].create_index(keys, **opts)
        except Exception as exc:  # pragma: no cover - defensive, logged not fatal
            logger.warning("Could not create index on %s %s: %s", collection, keys, exc)
