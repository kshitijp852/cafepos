import asyncio


def _bill_payload():
    return {
        "items": [{"menu_item_id": "m1", "menu_item_name": "Latte", "quantity": 2, "price": 100}],
        "payment_method": "cash",
    }


async def test_bill_defaults_to_cafe_tax_rate(api, owner):
    resp = await api.post("/api/bills", json=_bill_payload(), headers=owner["headers"])
    assert resp.status_code == 200, resp.text
    bill = resp.json()
    # Cafe default tax is 5% → 200 subtotal + 10 tax.
    assert bill["subtotal"] == 200
    assert bill["tax_percentage"] == 5.0
    assert bill["tax"] == 10
    assert bill["total"] == 210
    assert bill["bill_number"] == 1
    assert bill["bill_hash"]


async def test_bill_normalizes_customer_phone(api, owner):
    resp = await api.post(
        "/api/bills",
        json={**_bill_payload(), "customer_name": "Asha", "customer_phone": "98765 43210"},
        headers=owner["headers"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["customer_name"] == "Asha"
    assert resp.json()["customer_phone"] == "+919876543210"


async def test_bill_numbers_are_sequential(api, owner):
    numbers = []
    for _ in range(3):
        resp = await api.post("/api/bills", json=_bill_payload(), headers=owner["headers"])
        numbers.append(resp.json()["bill_number"])
    assert numbers == [1, 2, 3]


async def test_bill_numbers_unique_under_concurrency(api, owner):
    """Concurrent bill creation must never hand out duplicate numbers."""
    results = await asyncio.gather(
        *[api.post("/api/bills", json=_bill_payload(), headers=owner["headers"]) for _ in range(10)]
    )
    numbers = sorted(r.json()["bill_number"] for r in results if r.status_code == 200)
    assert len(numbers) == 10
    assert len(set(numbers)) == 10  # all distinct


async def _make_table(api, owner):
    floor = (await api.post("/api/floors", json={"name": "Ground"}, headers=owner["headers"])).json()
    t = await api.post(
        "/api/tables", json={"name": "T1", "floor_id": floor["id"], "capacity": 4}, headers=owner["headers"]
    )
    return t.json()


async def test_table_dwell_timer_lifecycle(api, owner):
    table = await _make_table(api, owner)
    items = [{"menu_item_id": "m1", "menu_item_name": "Latte", "quantity": 1, "price": 100}]

    # First order stamps seated_at and occupies the table.
    order = await api.post(
        "/api/orders", json={"table_id": table["id"], "items": items, "status": "active"}, headers=owner["headers"]
    )
    assert order.status_code == 200, order.text
    seated = next(t for t in (await api.get("/api/tables", headers=owner["headers"])).json() if t["id"] == table["id"])
    assert seated["seated_at"] is not None
    assert seated["status"] == "occupied"
    first_seated = seated["seated_at"]

    # A second order must not reset the sitting's start.
    await api.post(
        "/api/orders", json={"table_id": table["id"], "items": items, "status": "active"}, headers=owner["headers"]
    )
    again = next(t for t in (await api.get("/api/tables", headers=owner["headers"])).json() if t["id"] == table["id"])
    assert again["seated_at"] == first_seated

    # Settling the bill records dwell and frees the table (timer ends).
    bill = await api.post(
        "/api/bills",
        json={"table_id": table["id"], "items": items, "payment_method": "cash", "order_id": order.json()["id"]},
        headers=owner["headers"],
    )
    assert bill.status_code == 200, bill.text
    assert bill.json()["dwell_seconds"] is not None and bill.json()["dwell_seconds"] >= 0
    freed = next(t for t in (await api.get("/api/tables", headers=owner["headers"])).json() if t["id"] == table["id"])
    assert freed["seated_at"] is None
    assert freed["status"] == "available"
