from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends

from app.core.deps import require_user_session
from app.db.mongo import db
from app.models.common import PaymentMethod

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/daily")
async def get_daily_report(report_date: Optional[str] = None, current_user: dict = Depends(require_user_session)):
    cafe_id = current_user["cafe_id"]
    report_date = report_date or date.today().isoformat()

    session = await db.day_sessions.find_one(
        {"cafe_id": cafe_id, "session_date": report_date}, {"_id": 0}
    )

    start = datetime.fromisoformat(report_date).replace(hour=0, minute=0, second=0)
    end = start.replace(hour=23, minute=59, second=59)
    bills = await db.bills.find(
        {
            "cafe_id": cafe_id,
            "soft_deleted": False,
            "created_at": {"$gte": start.isoformat(), "$lte": end.isoformat()},
        },
        {"_id": 0},
    ).to_list(5000)

    # Pre-seed every payment method to 0 so an unexpected method never KeyErrors.
    payment_breakdown = {method.value: 0.0 for method in PaymentMethod}
    item_counts: dict[str, int] = {}
    for bill in bills:
        method = bill.get("payment_method", PaymentMethod.cash.value)
        payment_breakdown[method] = payment_breakdown.get(method, 0.0) + bill["total"]
        for item in bill["items"]:
            item_counts[item["menu_item_name"]] = item_counts.get(item["menu_item_name"], 0) + item["quantity"]

    return {
        "date": report_date,
        "session": session,
        "total_bills": len(bills),
        "total_sales": sum(bill["total"] for bill in bills),
        "payment_breakdown": payment_breakdown,
        "popular_items": sorted(item_counts.items(), key=lambda x: x[1], reverse=True)[:10],
    }


WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# Upper bound (minutes, exclusive) -> bucket label for table dwell time.
DWELL_BUCKETS = [(15, "<15m"), (30, "15–30m"), (45, "30–45m"), (60, "45–60m"), (90, "1–1.5h"), (None, "1.5h+")]


def _parse_created(value) -> Optional[datetime]:
    """created_at may come back as a datetime or an ISO string depending on how
    the bill was written (server insert vs. replayed offline queue)."""
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str) and value:
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


@router.get("/analytics")
async def get_analytics(tz_offset: int = 0, current_user: dict = Depends(require_user_session)):
    """Cafe-wide analytics: today, all-time totals, payment split, top items,
    revenue trends, hour/weekday patterns, order-type + dwell distributions,
    and a per-staff leaderboard.

    `tz_offset` is the client's minutes-east-of-UTC (i.e. `-getTimezoneOffset()`).
    Bills are stored in UTC, so every day/hour bucket is shifted by it before
    slicing. Defaults to 0 = bucket in UTC, matching the historical behaviour.
    """
    cafe_id = current_user["cafe_id"]
    shift = timedelta(minutes=tz_offset)
    bills = await db.bills.find(
        {"cafe_id": cafe_id, "soft_deleted": False}, {"_id": 0}
    ).to_list(50000)

    # Bills store created_at in UTC; `shift` moves each one into the client's
    # local wall clock so day/hour buckets line up with the cafe's trading day.
    local_today = (datetime.now(timezone.utc) + shift).date()
    today = local_today.isoformat()
    payment_breakdown = {m.value: 0.0 for m in PaymentMethod}
    today_payment = {m.value: 0.0 for m in PaymentMethod}
    item_counts: dict[str, int] = {}
    item_revenue: dict[str, float] = {}
    by_staff: dict[str, dict] = {}
    by_day: dict[str, float] = {}
    bills_by_day: dict[str, int] = {}
    by_hour = [{"hour": h, "revenue": 0.0, "bills": 0} for h in range(24)]
    by_weekday = [{"weekday": i, "label": lbl, "revenue": 0.0, "bills": 0} for i, lbl in enumerate(WEEKDAY_LABELS)]
    order_types = {k: {"revenue": 0.0, "bills": 0} for k in ("dine_in", "takeaway", "delivery")}
    dwell_counts = {label: 0 for _, label in DWELL_BUCKETS}
    dwell_total, dwell_n = 0, 0
    today_bills = 0

    for b in bills:
        method = b.get("payment_method", PaymentMethod.cash.value)
        total = b.get("total", 0)
        created = _parse_created(b.get("created_at"))
        local = (created + shift) if created else None
        day = local.date().isoformat() if local else str(b.get("created_at", ""))[:10]
        payment_breakdown[method] = payment_breakdown.get(method, 0.0) + total
        by_day[day] = by_day.get(day, 0.0) + total
        bills_by_day[day] = bills_by_day.get(day, 0) + 1
        if local:
            by_hour[local.hour]["revenue"] += total
            by_hour[local.hour]["bills"] += 1
            wd = by_weekday[local.weekday()]
            wd["revenue"] += total
            wd["bills"] += 1
        if day == today:
            today_bills += 1
            today_payment[method] = today_payment.get(method, 0.0) + total
        for it in b.get("items", []):
            name, qty = it["menu_item_name"], it["quantity"]
            item_counts[name] = item_counts.get(name, 0) + qty
            item_revenue[name] = item_revenue.get(name, 0.0) + it.get("price", 0) * qty

        # Order type is inferred from the charge applied at settle: delivery wins
        # over packing, and a bill with neither charge is dine-in.
        if b.get("delivery_charge", 0):
            kind = "delivery"
        elif b.get("packing_charge", 0):
            kind = "takeaway"
        else:
            kind = "dine_in"
        order_types[kind]["revenue"] += total
        order_types[kind]["bills"] += 1

        dwell = b.get("dwell_seconds")
        if dwell:
            mins = dwell / 60
            dwell_total += dwell
            dwell_n += 1
            for upper, label in DWELL_BUCKETS:
                if upper is None or mins < upper:
                    dwell_counts[label] += 1
                    break

        wid = b.get("waiter_id")
        if wid:
            s = by_staff.setdefault(wid, {"waiter_id": wid, "waiter_name": b.get("waiter_name") or "Staff", "revenue": 0.0, "bills": 0})
            s["revenue"] += total
            s["bills"] += 1

    total_revenue = sum(b.get("total", 0) for b in bills)
    today_revenue = sum(v for d, v in by_day.items() if d == today)

    # Daily series (oldest -> newest), zero-filled. 90 days covers every range
    # the client offers; it slices the tail for the 7/30-day views.
    def day_series(days: int) -> list[dict]:
        out = []
        for i in range(days - 1, -1, -1):
            d = (local_today - timedelta(days=i)).isoformat()
            revenue, count = round(by_day.get(d, 0.0), 2), bills_by_day.get(d, 0)
            out.append({
                "date": d,
                "revenue": revenue,
                "bills": count,
                "avg_bill": round(revenue / count, 2) if count else 0.0,
            })
        return out

    trend_90 = day_series(90)
    trend = [{"date": d["date"], "revenue": d["revenue"]} for d in trend_90[-7:]]

    for s in by_staff.values():
        s["avg_bill"] = round(s["revenue"] / s["bills"], 2) if s["bills"] else 0.0

    return {
        "today": {
            "revenue": today_revenue,
            "bills": today_bills,
            "payment_breakdown": today_payment,
        },
        "totals": {
            "revenue": total_revenue,
            "bills": len(bills),
            "avg_bill": (total_revenue / len(bills)) if bills else 0,
        },
        "payment_breakdown": payment_breakdown,
        "top_items": sorted(item_counts.items(), key=lambda x: x[1], reverse=True)[:10],
        "top_items_revenue": sorted(
            ({"name": n, "qty": item_counts[n], "revenue": round(r, 2)} for n, r in item_revenue.items()),
            key=lambda x: x["revenue"],
            reverse=True,
        )[:10],
        "trend_7d": trend,
        "trend_daily": trend_90,
        "by_hour": [{**h, "revenue": round(h["revenue"], 2)} for h in by_hour],
        "by_weekday": [{**w, "revenue": round(w["revenue"], 2)} for w in by_weekday],
        "order_types": {k: {"revenue": round(v["revenue"], 2), "bills": v["bills"]} for k, v in order_types.items()},
        "dwell": {
            "buckets": [{"label": label, "count": dwell_counts[label]} for _, label in DWELL_BUCKETS],
            "avg_seconds": round(dwell_total / dwell_n) if dwell_n else 0,
            "sampled_bills": dwell_n,
        },
        "by_staff": sorted(by_staff.values(), key=lambda x: x["revenue"], reverse=True),
    }


# Upper bound (visits, inclusive) -> label for the visit-frequency histogram.
VISIT_BUCKETS = [(1, "1 visit"), (2, "2 visits"), (5, "3–5"), (10, "6–10"), (None, "11+")]

# A customer with no visit inside this window counts as lapsed.
LAPSED_AFTER_DAYS = 45


@router.get("/customers")
async def get_customer_insights(tz_offset: int = 0, limit: int = 20, current_user: dict = Depends(require_user_session)):
    """Who the cafe's customers are, from the name/phone captured at settlement.

    Customers are identified by phone, which the settle flow normalizes to
    E.164 — bills with no phone can't be attributed to anyone and are only
    counted towards the capture rate. `tz_offset` matches /analytics.
    """
    cafe_id = current_user["cafe_id"]
    shift = timedelta(minutes=tz_offset)
    bills = await db.bills.find(
        {"cafe_id": cafe_id, "soft_deleted": False},
        {"_id": 0, "customer_name": 1, "customer_phone": 1, "total": 1, "created_at": 1, "items": 1},
    ).to_list(50000)

    today_local = (datetime.now(timezone.utc) + shift).date()
    customers: dict[str, dict] = {}
    identified_bills = 0
    identified_revenue = 0.0
    total_revenue = 0.0

    # Sorted so "was this phone seen before?" can be decided in one pass.
    def sort_key(b):
        created = _parse_created(b.get("created_at"))
        return created or datetime.min.replace(tzinfo=timezone.utc)

    ordered = sorted(bills, key=sort_key)
    # New vs returning bills per day, for the last 90 local days.
    by_day: dict[str, dict] = {}

    for b in ordered:
        total = b.get("total", 0)
        total_revenue += total
        created = _parse_created(b.get("created_at"))
        local = (created + shift) if created else None
        day = local.date().isoformat() if local else None

        phone = (b.get("customer_phone") or "").strip()
        if not phone:
            continue

        identified_bills += 1
        identified_revenue += total
        c = customers.get(phone)
        is_new = c is None
        if c is None:
            c = customers[phone] = {
                "phone": phone,
                "name": (b.get("customer_name") or "").strip() or "Unnamed",
                "visits": 0,
                "revenue": 0.0,
                "items": 0,
                "first_visit": day,
                "last_visit": day,
            }
        # Keep the most recent non-empty name — people get spelled properly later.
        if (b.get("customer_name") or "").strip():
            c["name"] = b["customer_name"].strip()
        c["visits"] += 1
        c["revenue"] += total
        c["items"] += sum(i.get("quantity", 0) for i in b.get("items", []))
        if day:
            c["last_visit"] = day
            c["first_visit"] = c["first_visit"] or day

        if day:
            d = by_day.setdefault(day, {"date": day, "new": 0, "returning": 0})
            d["new" if is_new else "returning"] += 1

    repeat = [c for c in customers.values() if c["visits"] > 1]
    repeat_revenue = sum(c["revenue"] for c in repeat)
    visits_total = sum(c["visits"] for c in customers.values())

    visit_counts = {label: 0 for _, label in VISIT_BUCKETS}
    for c in customers.values():
        for upper, label in VISIT_BUCKETS:
            if upper is None or c["visits"] <= upper:
                visit_counts[label] += 1
                break

    # Recency split — how much of the book is still live.
    active, lapsed = 0, 0
    for c in customers.values():
        last = c["last_visit"]
        gap = (today_local - date.fromisoformat(last)).days if last else None
        c["days_since"] = gap
        c["avg_bill"] = round(c["revenue"] / c["visits"], 2) if c["visits"] else 0.0
        c["revenue"] = round(c["revenue"], 2)
        if gap is not None and gap <= LAPSED_AFTER_DAYS:
            active += 1
        else:
            lapsed += 1

    trend = []
    for i in range(89, -1, -1):
        d = (today_local - timedelta(days=i)).isoformat()
        row = by_day.get(d, {"date": d, "new": 0, "returning": 0})
        trend.append(row)

    return {
        "totals": {
            "bills": len(bills),
            "identified_bills": identified_bills,
            # What share of settlements actually captured a phone number.
            "capture_rate": round((identified_bills / len(bills)) * 100, 1) if bills else 0.0,
            "identified_revenue": round(identified_revenue, 2),
            "unidentified_revenue": round(total_revenue - identified_revenue, 2),
            "customers": len(customers),
            "repeat_customers": len(repeat),
            "repeat_rate": round((len(repeat) / len(customers)) * 100, 1) if customers else 0.0,
            "repeat_revenue": round(repeat_revenue, 2),
            "repeat_revenue_share": round((repeat_revenue / identified_revenue) * 100, 1) if identified_revenue else 0.0,
            "avg_visits": round(visits_total / len(customers), 2) if customers else 0.0,
            "avg_spend": round(identified_revenue / len(customers), 2) if customers else 0.0,
            "active_customers": active,
            "lapsed_customers": lapsed,
            "lapsed_after_days": LAPSED_AFTER_DAYS,
        },
        "visit_buckets": [{"label": label, "count": visit_counts[label]} for _, label in VISIT_BUCKETS],
        "new_vs_returning": trend,
        "top_customers": sorted(customers.values(), key=lambda c: c["revenue"], reverse=True)[:limit],
        "recent_lapsed": sorted(
            (c for c in customers.values() if c["visits"] > 1 and (c["days_since"] or 0) > LAPSED_AFTER_DAYS),
            key=lambda c: c["revenue"],
            reverse=True,
        )[:limit],
    }
