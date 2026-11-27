"""One-off CLI to create the platform_admin account.

There is no self-serve or invite path for platform_admin — it sits above every
cafe, so the only way one is ever created is by running this script with
direct access to the database:

    python scripts/create_platform_admin.py --email admin@cafepos.app --name "Ops"
"""
import argparse
import asyncio
import getpass
import sys

from app.core.security import get_password_hash
from app.db.mongo import db
from app.db.serialization import to_mongo
from app.models.common import Role
from app.models.user import User


async def main() -> None:
    parser = argparse.ArgumentParser(description="Create a platform_admin account.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--password", help="Omit to be prompted instead (avoids shell history).")
    args = parser.parse_args()

    if await db.users.find_one({"email": args.email}):
        sys.exit(f"A user with email {args.email!r} already exists.")

    password = args.password or getpass.getpass("Password: ")
    if len(password) < 6:
        sys.exit("Password must be at least 6 characters.")

    user = User(
        email=args.email,
        name=args.name,
        role=Role.platform_admin.value,
        cafe_id=None,
        is_email_verified=True,
    )
    doc = to_mongo(user)
    doc["password"] = get_password_hash(password)
    await db.users.insert_one(doc)
    print(f"Created platform_admin {args.email!r} (id={user.id}).")


if __name__ == "__main__":
    asyncio.run(main())
