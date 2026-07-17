"""Cafe-level helpers shared across routers."""

DEFAULT_TAX_PERCENTAGE = 5.0


async def get_tax_percentage(db, cafe_id: str) -> float:
    """The cafe's configured tax rate — the single source used by orders and bills."""
    cafe = await db.cafes.find_one({"id": cafe_id}, {"_id": 0, "tax_percentage": 1})
    if cafe and cafe.get("tax_percentage") is not None:
        return float(cafe["tax_percentage"])
    return DEFAULT_TAX_PERCENTAGE
