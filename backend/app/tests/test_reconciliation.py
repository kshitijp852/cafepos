def _items():
    return [{"menu_item_id": "m1", "menu_item_name": "Latte", "quantity": 1, "price": 100}]


async def _table(api, owner):
    floor = (await api.post("/api/floors", json={"name": "G"}, headers=owner["headers"])).json()
    return (await api.post(
        "/api/tables", json={"name": "T1", "floor_id": floor["id"], "capacity": 4}, headers=owner["headers"]
    )).json()


async def test_duplicate_table_orders_detected_and_resolved(api, owner):
    table = await _table(api, owner)
    o1 = (await api.post(
        "/api/orders", json={"table_id": table["id"], "items": _items(), "status": "active"}, headers=owner["headers"]
    )).json()
    (await api.post(
        "/api/orders", json={"table_id": table["id"], "items": _items(), "status": "active"}, headers=owner["headers"]
    )).json()

    rec = (await api.get("/api/reconciliation", headers=owner["headers"])).json()
    assert rec["count"] == 1
    dup = rec["duplicate_table_orders"][0]
    assert dup["table_id"] == table["id"] and len(dup["orders"]) == 2

    res = await api.post(
        f"/api/reconciliation/tables/{table['id']}/resolve",
        json={"keep_order_id": o1["id"]}, headers=owner["headers"],
    )
    assert res.status_code == 200, res.text

    rec2 = (await api.get("/api/reconciliation", headers=owner["headers"])).json()
    assert rec2["count"] == 0
    tables = (await api.get("/api/tables", headers=owner["headers"])).json()
    t = next(t for t in tables if t["id"] == table["id"])
    assert t["current_order_id"] == o1["id"] and t["status"] == "occupied"


async def test_double_settled_order_detected_and_voided(api, owner):
    o = (await api.post(
        "/api/orders", json={"items": _items(), "status": "active"}, headers=owner["headers"]
    )).json()
    (await api.post(
        "/api/bills", json={"items": _items(), "payment_method": "cash", "order_id": o["id"]}, headers=owner["headers"]
    )).json()
    b2 = (await api.post(
        "/api/bills", json={"items": _items(), "payment_method": "cash", "order_id": o["id"]}, headers=owner["headers"]
    )).json()

    rec = (await api.get("/api/reconciliation", headers=owner["headers"])).json()
    assert rec["count"] == 1
    ds = rec["double_settled_orders"][0]
    assert ds["order_id"] == o["id"] and len(ds["bills"]) == 2

    v = await api.post(f"/api/bills/{b2['id']}/void", json={"reason": "duplicate"}, headers=owner["headers"])
    assert v.status_code == 200, v.text

    rec2 = (await api.get("/api/reconciliation", headers=owner["headers"])).json()
    assert rec2["count"] == 0
    bills = (await api.get("/api/bills", headers=owner["headers"])).json()
    assert all(b["id"] != b2["id"] for b in bills)
