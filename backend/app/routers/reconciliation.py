"""Reconnect reconciliation: surface conflicts created while tablets were
offline islands, and let a manager resolve them without ever dropping a sale.

Two conflict kinds arise when queued offline writes replay:
  * **Duplicate open orders on one table** — two devices each opened an order for
    the same table while offline.
  * **Double-settled orders** — one order was settled on two devices, producing
    two bills.
"""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pymongo import ReturnDocument

from app.core.deps import require_role
from app.db.mongo import db
from app.models.common import OrderStatus, SessionStatus, TableStatus

router = APIRouter(prefix="/reconciliation", tags=["reconciliation"])

_MANAGER = require_role(["owner", "superadmin"])
_TERMINAL = [OrderStatus.completed.value, OrderStatus.cancelled.value]


def _order_summary(o: dict) -> dict:
    return {
        "id": o["id"],
        "status": o.get("status"),
        "item_count": sum(i.get("quantity", 0) for i in o.get("items", [])),
        "total": o.get("total", 0),
        "waiter_name": o.get("waiter_name"),
        "created_at": o.get("created_at"),
    }


def _bill_summary(b: dict) -> dict:
    return {
        "id": b["id"],
        "series": b.get("series", ""),
        "bill_number": b.get("bill_number"),
        "total": b.get("total", 0),
        "payment_method": b.get("payment_method"),
        "created_at": b.get("created_at"),
    }


@router.get("")
async def get_conflicts(current_user: dict = Depends(_MANAGER)):
    cafe_id = current_user["cafe_id"]

    # (a) Tables carrying more than one open order.
    open_orders = await db.orders.find(
        {"cafe_id": cafe_id, "status": {"$nin": _TERMINAL}, "table_id": {"$ne": None}},
        {"_id": 0},
    ).to_list(1000)
    by_table: dict[str, list] = {}
    for o in open_orders:
        by_table.setdefault(o["table_id"], []).append(o)
    table_names = {
        t["id"]: t.get("name")
        for t in await db.tables.find({"cafe_id": cafe_id}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    }
    duplicate_table_orders = [
        {
            "table_id": tid,
            "table_name": table_names.get(tid),
            "orders": [_order_summary(o) for o in sorted(orders, key=lambda x: x.get("created_at", ""))],
        }
        for tid, orders in by_table.items()
        if len(orders) > 1
    ]

    # (b) Orders that produced more than one live bill.
    bills = await db.bills.find(
        {"cafe_id": cafe_id, "soft_deleted": False, "order_id": {"$ne": None}},
        {"_id": 0},
    ).to_list(2000)
    by_order: dict[str, list] = {}
    for b in bills:
        by_order.setdefault(b["order_id"], []).append(b)
    double_settled_orders = [
        {"order_id": oid, "bills": [_bill_summary(b) for b in sorted(bs, key=lambda x: x.get("created_at", ""))]}
        for oid, bs in by_order.items()
        if len(bs) > 1
    ]

    return {
        "duplicate_table_orders": duplicate_table_orders,
        "double_settled_orders": double_settled_orders,
        "count": len(duplicate_table_orders) + len(double_settled_orders),
    }


class ResolveTableIn(BaseModel):
    keep_order_id: str


@router.post("/tables/{table_id}/resolve")
async def resolve_table(table_id: str, payload: ResolveTableIn, current_user: dict = Depends(_MANAGER)):
    """Keep one order for a contested table, cancel the rest, re-point the table."""
    cafe_id = current_user["cafe_id"]
    open_orders = await db.orders.find(
        {"cafe_id": cafe_id, "table_id": table_id, "status": {"$nin": _TERMINAL}}, {"_id": 0, "id": 1}
    ).to_list(1000)
    ids = {o["id"] for o in open_orders}
    if payload.keep_order_id not in ids:
        raise HTTPException(status_code=400, detail="keep_order_id is not an open order on this table.")

    now = datetime.now(timezone.utc).isoformat()
    for oid in ids - {payload.keep_order_id}:
        await db.orders.update_one(
            {"id": oid}, {"$set": {"status": OrderStatus.cancelled.value, "updated_at": now}}
        )
    await db.tables.update_one(
        {"id": table_id, "cafe_id": cafe_id},
        {"$set": {"status": TableStatus.occupied.value, "current_order_id": payload.keep_order_id}},
    )
    return {"message": "Table conflict resolved", "kept": payload.keep_order_id, "cancelled": len(ids) - 1}
