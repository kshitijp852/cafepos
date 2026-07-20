from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user, require_user_session
from app.db.mongo import db
from app.db.serialization import to_mongo
from app.models.common import OrderStatus, TableStatus, new_id
from app.models.order import Order, OrderCreate, OrderStatusUpdate, OrderUpdate
from app.services.cafe import get_tax_percentage
from app.services.orders import can_transition, is_terminal

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=List[Order])
async def get_orders(
    status: str = OrderStatus.active.value,
    limit: int = 200,
    skip: int = 0,
    current_user: dict = Depends(get_current_user),
):
    return await db.orders.find(
        {"cafe_id": current_user["cafe_id"], "status": status}, {"_id": 0}
    ).skip(skip).to_list(limit)


@router.post("", response_model=Order)
async def create_order(payload: OrderCreate, current_user: dict = Depends(get_current_user)):
    cafe_id = current_user["cafe_id"]

    # Idempotent replay: an order created offline is queued with a client-generated
    # id and replayed on reconnect. If that id already exists, return it unchanged.
    if payload.id:
        existing = await db.orders.find_one({"id": payload.id, "cafe_id": cafe_id}, {"_id": 0})
        if existing:
            return existing

    tax_pct = await get_tax_percentage(db, cafe_id)
    subtotal = sum(item.price * item.quantity for item in payload.items)
    tax = subtotal * tax_pct / 100
    total = subtotal + tax

    # A device session attributes orders to whoever the manager has assigned to it
    # (or no one — ordering-only). Manager sessions use the client-supplied waiter.
    if current_user.get("device_id"):
        waiter_id = current_user.get("user_id")
        waiter = await db.users.find_one({"id": waiter_id}, {"_id": 0, "name": 1}) if waiter_id else None
        waiter_name = waiter["name"] if waiter else None
    else:
        waiter_id = payload.waiter_id
        waiter_name = payload.waiter_name

    order = Order(
        id=payload.id or new_id(),
        cafe_id=cafe_id,
        table_id=payload.table_id,
        items=payload.items,
        subtotal=subtotal,
        tax=tax,
        tax_percentage=tax_pct,
        total=total,
        status=payload.status,
        waiter_id=waiter_id,
        waiter_name=waiter_name,
    )
    await db.orders.insert_one(to_mongo(order))

    if payload.table_id:
        # Stamp the sitting's start on the FIRST order only (seated_at is null),
        # so the dwell timer measures from when the customer sat, not the latest order.
        await db.tables.update_one(
            {"id": payload.table_id, "cafe_id": cafe_id, "seated_at": None},
            {"$set": {"seated_at": datetime.now(timezone.utc).isoformat()}},
        )
        await db.tables.update_one(
            {"id": payload.table_id, "cafe_id": cafe_id},
            {"$set": {"status": TableStatus.occupied.value, "current_order_id": order.id}},
        )
    return order


@router.put("/{order_id}", response_model=Order)
async def update_order(order_id: str, payload: OrderUpdate, current_user: dict = Depends(get_current_user)):
    existing = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this order.")

    tax_pct = await get_tax_percentage(db, current_user["cafe_id"])
    subtotal = sum(item.price * item.quantity for item in payload.items)
    tax = subtotal * tax_pct / 100
    total = subtotal + tax

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "items": [item.model_dump() for item in payload.items],
            "subtotal": subtotal,
            "tax": tax,
            "tax_percentage": tax_pct,
            "total": total,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


@router.put("/{order_id}/status", response_model=Order)
async def update_order_status(order_id: str, payload: OrderStatusUpdate, current_user: dict = Depends(get_current_user)):
    """Advance an order through the unified lifecycle (KOT flow).

    Enforces valid transitions and frees the table when the order reaches a
    terminal state.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    if order["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this order.")

    target = payload.status.value
    if not can_transition(order["status"], target):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot move order from '{order['status']}' to '{target}'.",
        )

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": target, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if is_terminal(target) and order.get("table_id"):
        await db.tables.update_one(
            {"id": order["table_id"]},
            {"$set": {"status": TableStatus.available.value, "current_order_id": None, "seated_at": None}},
        )
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


@router.delete("/{order_id}")
async def cancel_order(order_id: str, current_user: dict = Depends(require_user_session)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    if order["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this order.")

    if order.get("table_id"):
        await db.tables.update_one(
            {"id": order["table_id"]},
            {"$set": {"status": TableStatus.available.value, "current_order_id": None, "seated_at": None}},
        )
    await db.orders.update_one({"id": order_id}, {"$set": {"status": OrderStatus.cancelled.value}})
    return {"message": "Order cancelled successfully"}
