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
