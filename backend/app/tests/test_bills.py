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


async def test_bill_tax_split_and_charges(api, owner):
    # Configure a 2.5+2.5 GST split and take-away charges.
    await api.patch(
        "/api/cafe",
        json={"cgst_percentage": 2.5, "sgst_percentage": 2.5, "packing_charge": 15, "delivery_charge": 40},
        headers=owner["headers"],
    )
    resp = await api.post(
        "/api/bills",
        json={**_bill_payload(), "packing_charge": 15, "delivery_charge": 40},
        headers=owner["headers"],
    )
    assert resp.status_code == 200, resp.text
    b = resp.json()
    # 200 subtotal, 2.5% CGST + 2.5% SGST = 5 + 5 = 10 tax, +15 packing +40 delivery.
    assert b["cgst"] == 5 and b["sgst"] == 5
    assert b["cgst_percentage"] == 2.5 and b["sgst_percentage"] == 2.5
    assert b["packing_charge"] == 15 and b["delivery_charge"] == 40
    assert b["total"] == 200 + 10 + 15 + 40


async def test_cafe_settings_update_recomputes_tax(api, owner):
    resp = await api.patch(
        "/api/cafe", json={"cgst_percentage": 9, "sgst_percentage": 9}, headers=owner["headers"]
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["tax_percentage"] == 18


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


async def test_bill_replay_is_idempotent(api, owner):
    """Replaying an offline-queued settle (same client id) must not double-bill."""
    payload = {**_bill_payload(), "id": "fixed-bill-1"}
    first = await api.post("/api/bills", json=payload, headers=owner["headers"])
    assert first.status_code == 200, first.text
    b1 = first.json()

    second = await api.post("/api/bills", json=payload, headers=owner["headers"])
    assert second.status_code == 200, second.text
    b2 = second.json()
    # Same stored bill returned; no second number burned.
    assert b2["id"] == b1["id"]
    assert b2["bill_number"] == b1["bill_number"]

    bills = (await api.get("/api/bills", headers=owner["headers"])).json()
    assert sum(1 for x in bills if x["id"] == "fixed-bill-1") == 1

    # A genuinely new bill still advances sequentially from the real last number.
    third = await api.post("/api/bills", json=_bill_payload(), headers=owner["headers"])
    assert third.json()["bill_number"] == b1["bill_number"] + 1


async def test_order_replay_is_idempotent(api, owner):
    """Replaying an offline-queued order (same client id) must not duplicate it."""
    items = [{"menu_item_id": "m1", "menu_item_name": "Latte", "quantity": 1, "price": 100}]
    payload = {"id": "fixed-order-1", "items": items, "status": "active"}
    first = await api.post("/api/orders", json=payload, headers=owner["headers"])
    assert first.status_code == 200, first.text
    second = await api.post("/api/orders", json=payload, headers=owner["headers"])
    assert second.status_code == 200, second.text
    assert second.json()["id"] == first.json()["id"]

    orders = (await api.get("/api/orders", headers=owner["headers"])).json()
    assert sum(1 for o in orders if o["id"] == "fixed-order-1") == 1


async def test_bill_series_claim_and_reserve(api, owner):
    claim = await api.post("/api/bills/series/claim", json={"preferred": "C"}, headers=owner["headers"])
    assert claim.status_code == 200, claim.text
    code = claim.json()["series_code"]
    assert code == "C"
    # Re-claiming the same preferred label hands out a distinct series.
    claim2 = await api.post("/api/bills/series/claim", json={"preferred": "C"}, headers=owner["headers"])
    assert claim2.json()["series_code"] != code

    block = (await api.post(
        "/api/bills/series/reserve", json={"series_code": code, "count": 5}, headers=owner["headers"]
    )).json()
    assert block == {"series_code": "C", "start": 1, "end": 5}
    # The next block continues contiguously (no gaps within a series).
    block2 = (await api.post(
        "/api/bills/series/reserve", json={"series_code": code, "count": 3}, headers=owner["headers"]
    )).json()
    assert block2["start"] == 6 and block2["end"] == 8


async def test_offline_numbered_bill_recorded_as_is(api, owner):
    # A device-drawn serial is stored verbatim, independent of the default line.
    resp = await api.post(
        "/api/bills", json={**_bill_payload(), "series": "C", "bill_number": 7}, headers=owner["headers"]
    )
    assert resp.status_code == 200, resp.text
    b = resp.json()
    assert b["series"] == "C" and b["bill_number"] == 7
    # A default-line bill (no series) still starts at 1 and coexists with C-7.
    d = await api.post("/api/bills", json=_bill_payload(), headers=owner["headers"])
    assert d.json()["series"] == "" and d.json()["bill_number"] == 1


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
