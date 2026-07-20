"""Generate a heavy, realistic bill history for one cafe, for exercising the
analytics screens with something that looks like a real trading pattern.

Everything written carries ``demo_seed: True`` so it can be removed again:

    python scripts/seed_demo_data.py --email owner@example.com            # seed
    python scripts/seed_demo_data.py --email owner@example.com --purge    # undo

The generator shapes bills the way a cafe actually trades — busier at lunch and
dinner, busier at the weekend, growing slowly over the months, with a long tail
of unpopular menu items — so the charts show structure instead of noise.
Timestamps are built in the cafe's local time and stored in UTC, matching how
the app writes real bills.
"""
import argparse
import asyncio
import hashlib
import json
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

# Cafe-local timezone used to place bills on the clock. IST.
LOCAL_OFFSET = timedelta(hours=5, minutes=30)

# Relative trade weight per hour of the local day. Zero hours are closed.
HOUR_WEIGHTS = {
    8: 0.5, 9: 0.9, 10: 1.1, 11: 1.3,
    12: 2.6, 13: 3.2, 14: 2.4, 15: 1.2,
    16: 1.0, 17: 1.4, 18: 2.0, 19: 3.0,
    20: 3.4, 21: 2.6, 22: 1.2, 23: 0.4,
}
# Mon..Sun — weekends carry the week.
WEEKDAY_WEIGHTS = [0.85, 0.8, 0.9, 1.0, 1.35, 1.6, 1.45]

PAYMENT_WEIGHTS = {"upi": 0.46, "cash": 0.33, "card": 0.21}
ORDER_TYPE_WEIGHTS = {"dine_in": 0.68, "takeaway": 0.24, "delivery": 0.08}

STAFF_NAMES = ["Ravi Kumar", "Priya Nair", "Imran Shaikh", "Meera Joshi", "Sanjay Patil"]
CUSTOMER_NAMES = [
    "Aditya", "Kavya", "Rahul", "Sneha", "Vikram", "Ananya", "Rohit", "Divya",
    "Arjun", "Nisha", "Karthik", "Pooja", "Farhan", "Ishita", "Manish",
]


def bill_hash(bill_number: int, items: list[dict], total: float, timestamp: datetime, series: str = "") -> str:
    """Mirror of app.services.billing.calculate_bill_hash for raw dict items."""
    content = (
        f"{series}|{bill_number}|"
        f"{json.dumps(items, sort_keys=True)}|"
        f"{total}|{timestamp.isoformat()}"
    )
    return hashlib.sha256(content.encode()).hexdigest()


def weighted_choice(rng: random.Random, weights: dict) -> str:
    keys = list(weights)
    return rng.choices(keys, weights=[weights[k] for k in keys], k=1)[0]


async def resolve_cafe(db, email: str) -> tuple[str, str]:
    user = await db.users.find_one({"email": email}, {"_id": 0, "cafe_id": 1, "name": 1})
    if not user:
        sys.exit(f"No user with email {email!r} in this database.")
    cafe = await db.cafes.find_one({"id": user["cafe_id"]}, {"_id": 0, "name": 1})
    return user["cafe_id"], (cafe or {}).get("name", "(unnamed cafe)")


async def purge(db, cafe_id: str) -> None:
    bills = await db.bills.delete_many({"cafe_id": cafe_id, "demo_seed": True})
    staff = await db.users.delete_many({"cafe_id": cafe_id, "demo_seed": True})
    print(f"Removed {bills.deleted_count} seeded bills and {staff.deleted_count} seeded staff.")
    # The bill-number counter is rebuilt from the surviving bills on next use.
    await db.counters.delete_one({"_id": f"bill_number:{cafe_id}"})
    print("Reset the bill-number counter; it reseeds from the remaining bills.")


async def ensure_staff(db, cafe_id: str, count: int) -> list[dict]:
    existing = await db.users.find(
        {"cafe_id": cafe_id, "role": "staff"}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(50)
    if len(existing) >= count:
        return existing[:count]

    new_staff = []
    for name in STAFF_NAMES[len(existing) : count]:
        new_staff.append({
            "id": str(uuid.uuid4()),
            "email": f"{name.split()[0].lower()}.demo@seed.local",
            "name": name,
            "username": name.split()[0].lower(),
            "phone": None,
            "role": "staff",
            "cafe_id": cafe_id,
            "pin": None,
            "is_active": True,
            "device_token": None,
            "last_active": None,
            "created_by": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "demo_seed": True,
        })
    if new_staff:
        await db.users.insert_many(new_staff)
        print(f"Created {len(new_staff)} demo staff.")
    return existing + [{"id": s["id"], "name": s["name"]} for s in new_staff]


def build_items(rng: random.Random, menu: list[dict], popularity: list[float]) -> list[dict]:
    line_count = rng.choices([1, 2, 3, 4, 5, 6], weights=[18, 26, 24, 16, 10, 6], k=1)[0]
    chosen = rng.choices(menu, weights=popularity, k=line_count)
    items: dict[str, dict] = {}
    for m in chosen:
        line = items.get(m["id"])
        if line:
            line["quantity"] += 1
            continue
        items[m["id"]] = {
            "menu_item_id": m["id"],
            "menu_item_name": m["name"],
            "quantity": rng.choices([1, 2, 3], weights=[74, 20, 6], k=1)[0],
            "price": float(m["price"]),
            "variants": [],
            "addons": [],
            "notes": "",
        }
    return list(items.values())


async def seed(db, cafe_id: str, days: int, per_day: int, seed_value: int) -> None:
    rng = random.Random(seed_value)

    menu = await db.menu_items.find({"cafe_id": cafe_id}, {"_id": 0, "id": 1, "name": 1, "price": 1}).to_list(500)
    if not menu:
        sys.exit("This cafe has no menu items — add a menu before seeding bills.")
    tables = await db.tables.find({"cafe_id": cafe_id}, {"_id": 0, "id": 1}).to_list(200)
    staff = await ensure_staff(db, cafe_id, len(STAFF_NAMES))

    # Zipf-ish popularity: a few heroes, a long tail. Shuffled so the winners
    # aren't simply whatever the menu lists first.
    order = list(range(len(menu)))
    rng.shuffle(order)
    popularity = [0.0] * len(menu)
    for rank, idx in enumerate(order, start=1):
        popularity[idx] = 1.0 / (rank**0.85)

    # Staff get uneven workloads so the leaderboard has a real spread.
    staff_weights = [1.0 + 0.35 * i for i in range(len(staff))] if staff else []
    # Customer book: a Zipf-weighted pool, so a handful of regulars come back
    # weekly, a middle tier drops in a few times, and a long tail visits once.
    # Each also has an active window, so some churn and others only show up late.
    customer_pool = []
    for rank in range(1, 701):
        first_seen = rng.random() ** 2  # most have been around a while
        churn = 1.0 if rng.random() < 0.75 else rng.uniform(first_seen + 0.1, 1.0)
        customer_pool.append({
            "name": rng.choice(CUSTOMER_NAMES),
            "phone": f"+9198{rng.randint(10000000, 99999999)}",
            "weight": 1.0 / (rank**0.75),
            "from": first_seen,
            "until": churn,
        })
    pool_weights = [c["weight"] for c in customer_pool]

    counter_key = f"bill_number:{cafe_id}"
    counter = await db.counters.find_one({"_id": counter_key})
    if counter:
        next_number = counter["seq"] + 1
    else:
        last = await db.bills.find_one({"cafe_id": cafe_id, "series": {"$in": ["", None]}}, sort=[("bill_number", -1)])
        next_number = (last["bill_number"] if last else 0) + 1

    now_local = datetime.now(timezone.utc) + LOCAL_OFFSET
    today_local = now_local.date()
    docs: list[dict] = []

    for day_index in range(days - 1, -1, -1):
        day = today_local - timedelta(days=day_index)
        age = (days - day_index) / days  # 0 = oldest day, 1 = today
        # Slow growth over the window, a seasonal ripple, and day-to-day noise.
        growth = 0.65 + 0.5 * age
        ripple = 1 + 0.12 * ((day_index % 30) / 30 - 0.5)
        weekday = WEEKDAY_WEIGHTS[day.weekday()]
        expected = per_day * growth * ripple * weekday * rng.uniform(0.82, 1.18)

        is_today = day == today_local
        # The occasional dead day: a closure, a washout. Never today — an empty
        # "Revenue Today" tile reads as a broken page rather than a quiet day.
        if not is_today and rng.random() < 0.02:
            expected *= rng.uniform(0, 0.15)

        # Today is only partly traded, and bills must not be timestamped into
        # the future, so restrict it to the hours that have actually happened.
        hour_weights = HOUR_WEIGHTS
        if is_today:
            hour_weights = {h: w for h, w in HOUR_WEIGHTS.items() if h <= now_local.hour}
            if not hour_weights:
                continue
            traded = sum(hour_weights.values()) / sum(HOUR_WEIGHTS.values())
            expected *= traded

        count = max(0, int(round(expected)))

        for _ in range(count):
            hour = int(weighted_choice(rng, hour_weights))
            minute = rng.randint(0, now_local.minute) if is_today and hour == now_local.hour else rng.randint(0, 59)
            local_dt = datetime(day.year, day.month, day.day, hour, minute, rng.randint(0, 59))
            if is_today and local_dt > now_local.replace(tzinfo=None):
                local_dt = now_local.replace(tzinfo=None)
            created = (local_dt - LOCAL_OFFSET).replace(tzinfo=timezone.utc)

            items = build_items(rng, menu, popularity)
            subtotal = round(sum(i["price"] * i["quantity"] for i in items), 2)

            kind = weighted_choice(rng, ORDER_TYPE_WEIGHTS)
            packing = 20.0 if kind == "takeaway" else 0.0
            delivery = 40.0 if kind == "delivery" else 0.0

            tax_pct = 5.0
            tax = round(subtotal * tax_pct / 100, 2)
            total = round(subtotal + tax + packing + delivery, 2)

            waiter = None
            # Counter and delivery orders often aren't attributed to a server.
            if staff and kind == "dine_in" and rng.random() < 0.82:
                waiter = rng.choices(staff, weights=staff_weights, k=1)[0]

            # Dwell is only meaningful for a seated table.
            dwell = None
            if kind == "dine_in":
                dwell = max(240, int(rng.gauss(2400, 900)))

            # Staff only capture a name/phone on some settlements; delivery
            # nearly always needs one, dine-in often doesn't bother.
            capture = {"dine_in": 0.34, "takeaway": 0.55, "delivery": 0.95}[kind]
            customer = None
            if rng.random() < capture:
                for _ in range(6):
                    pick = rng.choices(customer_pool, weights=pool_weights, k=1)[0]
                    if pick["from"] <= age <= pick["until"]:
                        customer = (pick["name"], pick["phone"])
                        break
                else:
                    # Nobody in the book fits this date — treat it as a walk-in.
                    customer = (rng.choice(CUSTOMER_NAMES), f"+9198{rng.randint(10000000, 99999999)}")

            docs.append({
                "id": str(uuid.uuid4()),
                "bill_number": next_number,
                "series": "",
                "cafe_id": cafe_id,
                "table_id": rng.choice(tables)["id"] if tables and kind == "dine_in" else None,
                "items": items,
                "subtotal": subtotal,
                "tax": tax,
                "tax_percentage": tax_pct,
                "cgst": round(tax / 2, 2),
                "sgst": round(tax / 2, 2),
                "cgst_percentage": tax_pct / 2,
                "sgst_percentage": tax_pct / 2,
                "packing_charge": packing,
                "delivery_charge": delivery,
                "total": total,
                "payment_method": weighted_choice(rng, PAYMENT_WEIGHTS),
                "bill_hash": bill_hash(next_number, items, total, created),
                "cloud_synced": True,
                "order_id": None,
                "waiter_id": waiter["id"] if waiter else None,
                "waiter_name": waiter["name"] if waiter else None,
                "dwell_seconds": dwell,
                "customer_name": customer[0] if customer else None,
                "customer_phone": customer[1] if customer else None,
                "created_at": created.isoformat(),
                "soft_deleted": False,
                "demo_seed": True,
            })
            next_number += 1

    for start in range(0, len(docs), 1000):
        await db.bills.insert_many(docs[start : start + 1000])

    await db.counters.update_one({"_id": counter_key}, {"$set": {"seq": next_number - 1}}, upsert=True)

    revenue = sum(d["total"] for d in docs)
    print(f"Inserted {len(docs)} bills across {days} days — ₹{revenue:,.0f} of revenue.")
    print(f"Bill numbers {docs[0]['bill_number']}–{docs[-1]['bill_number']}; counter set to {next_number - 1}.")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed heavy demo bill history for a cafe.")
    parser.add_argument("--email", required=True, help="Owner email identifying the cafe.")
    parser.add_argument("--days", type=int, default=120, help="How many days back to generate.")
    parser.add_argument("--per-day", type=int, default=32, help="Baseline bills per day before weighting.")
    parser.add_argument("--seed", type=int, default=20260720, help="RNG seed, for reproducible data.")
    parser.add_argument("--purge", action="store_true", help="Delete previously seeded data and exit.")
    args = parser.parse_args()

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    cafe_id, cafe_name = await resolve_cafe(db, args.email)
    print(f"Cafe: {cafe_name} ({cafe_id}) in db {os.environ['DB_NAME']}")

    if args.purge:
        await purge(db, cafe_id)
    else:
        existing = await db.bills.count_documents({"cafe_id": cafe_id, "demo_seed": True})
        if existing:
            sys.exit(f"{existing} seeded bills already exist — run with --purge first.")
        await seed(db, cafe_id, args.days, args.per_day, args.seed)

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
