"""One-time migration: purge legacy staff secrets.

Staff no longer log in (devices do), so their password / password_enc / pin
fields are dead data. This unsets them for staff-role users only — manager
(owner/superadmin) accounts keep their passwords since they still log in.

Run from backend/:  python -m scripts.purge_staff_secrets
"""
import asyncio

from app.db.mongo import client, db
from app.models.common import Role

STAFF_ROLES = [Role.staff.value, "waiter"]


async def main() -> None:
    result = await db.users.update_many(
        {"role": {"$in": STAFF_ROLES}},
        {"$unset": {"password": "", "password_enc": "", "pin": ""}},
    )
    # Drop the whole credential-audit collection (feature removed).
    audit_dropped = 0
    if "credential_audit" in await db.list_collection_names():
        audit_dropped = await db.credential_audit.count_documents({})
        await db.credential_audit.drop()

    print(f"Cleared secrets on {result.modified_count} staff user(s).")
    print(f"Dropped {audit_dropped} credential-audit record(s).")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
