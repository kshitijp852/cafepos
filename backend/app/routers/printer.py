"""Printer endpoints (still mocked — they log a formatted ticket).

Now authenticated and cafe-scoped: a caller can only print bills/orders that
belong to their own cafe. Ready to be swapped for real ESC/POS output later.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user, require_user_session
from app.db.mongo import db

router = APIRouter(prefix="/printer", tags=["printer"])
logger = logging.getLogger("cafepos")


@router.post("/bill")
async def print_bill(bill_id: str, current_user: dict = Depends(require_user_session)):
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill or bill["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=404, detail="Bill not found")

    lines = [f"{i['menu_item_name']} x{i['quantity']} - {i['price'] * i['quantity']}" for i in bill["items"]]
    logger.info(
        "BILL PRINT (mock) #%s total=%s payment=%s items=[%s]",
        bill["bill_number"], bill["total"], bill["payment_method"], "; ".join(lines),
    )
    return {"message": "Bill printed successfully (mocked)", "bill_number": bill["bill_number"]}


@router.post("/kot")
async def print_kot(order_id: str, current_user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or order["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=404, detail="Order not found")

    lines = [f"{i['menu_item_name']} x{i['quantity']}" for i in order["items"]]
    logger.info(
        "KOT PRINT (mock) order=%s table=%s items=[%s]",
        order["id"][:8], order.get("table_id", "N/A"), "; ".join(lines),
    )
    return {"message": "KOT printed successfully (mocked)", "order_id": order["id"]}
