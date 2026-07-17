from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.db.mongo import db
from app.models.common import PaymentMethod

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/daily")
async def get_daily_report(report_date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
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


@router.get("/analytics")
async def get_analytics(current_user: dict = Depends(get_current_user)):
    """Cafe-wide analytics: today, all-time totals, payment split, top items,
    a 7-day revenue trend, and a per-staff leaderboard."""
    cafe_id = current_user["cafe_id"]
    bills = await db.bills.find(
        {"cafe_id": cafe_id, "soft_deleted": False}, {"_id": 0}
    ).to_list(50000)

    # Bills store created_at in UTC, so bucket "today" in UTC to avoid a
    # midnight-boundary mismatch with the server's local date.
    utc_today = datetime.now(timezone.utc).date()
    today = utc_today.isoformat()
    payment_breakdown = {m.value: 0.0 for m in PaymentMethod}
    today_payment = {m.value: 0.0 for m in PaymentMethod}
    item_counts: dict[str, int] = {}
    by_staff: dict[str, dict] = {}
    by_day: dict[str, float] = {}
    today_bills = 0

    for b in bills:
        method = b.get("payment_method", PaymentMethod.cash.value)
        total = b.get("total", 0)
        day = str(b.get("created_at", ""))[:10]
        payment_breakdown[method] = payment_breakdown.get(method, 0.0) + total
        by_day[day] = by_day.get(day, 0.0) + total
        if day == today:
            today_bills += 1
            today_payment[method] = today_payment.get(method, 0.0) + total
        for it in b.get("items", []):
            item_counts[it["menu_item_name"]] = item_counts.get(it["menu_item_name"], 0) + it["quantity"]
        wid = b.get("waiter_id")
        if wid:
            s = by_staff.setdefault(wid, {"waiter_id": wid, "waiter_name": b.get("waiter_name") or "Staff", "revenue": 0.0, "bills": 0})
            s["revenue"] += total
            s["bills"] += 1

    total_revenue = sum(b.get("total", 0) for b in bills)
    today_revenue = sum(v for d, v in by_day.items() if d == today)

    # 7-day trend (oldest -> newest), zero-filled.
    trend = []
    base = utc_today
    for i in range(6, -1, -1):
        d = (base - timedelta(days=i)).isoformat()
        trend.append({"date": d, "revenue": round(by_day.get(d, 0.0), 2)})

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
        "trend_7d": trend,
        "by_staff": sorted(by_staff.values(), key=lambda x: x["revenue"], reverse=True),
    }
