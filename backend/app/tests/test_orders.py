from .test_staff import _invite, _login_as


def _order_payload(table_id=None):
    return {
        "table_id": table_id,
        "items": [{"menu_item_id": "m1", "menu_item_name": "Latte", "quantity": 1, "price": 100}],
    }


async def test_counter_order_has_no_table(api, owner):
    resp = await api.post("/api/orders", json=_order_payload(), headers=owner["headers"])
    assert resp.status_code == 200, resp.text
    order = resp.json()
    assert order["table_id"] is None
    assert order["tax_percentage"] == 5.0
    assert order["total"] == 105  # 100 + 5% tax from cafe rate


async def test_order_lifecycle_transitions(api, owner):
    order = (await api.post("/api/orders", json=_order_payload(), headers=owner["headers"])).json()
    oid = order["id"]

    # Illegal jump pending → ready is rejected.
    bad = await api.put(f"/api/orders/{oid}/status", json={"status": "ready"}, headers=owner["headers"])
    assert bad.status_code == 400

    # Valid path: pending → preparing → ready → served.
    for target in ("preparing", "ready", "served"):
        ok = await api.put(f"/api/orders/{oid}/status", json={"status": target}, headers=owner["headers"])
        assert ok.status_code == 200, ok.text
        assert ok.json()["status"] == target


async def test_completed_is_not_reachable_through_status_put(api, owner):
    """completed only ever happens by creating a bill — this endpoint must
    refuse it as a direct target, even from the one state next to it."""
    order = (await api.post("/api/orders", json=_order_payload(), headers=owner["headers"])).json()
    oid = order["id"]
    for target in ("preparing", "ready", "served"):
        await api.put(f"/api/orders/{oid}/status", json={"status": target}, headers=owner["headers"])

    resp = await api.put(f"/api/orders/{oid}/status", json={"status": "completed"}, headers=owner["headers"])
    assert resp.status_code == 400


async def test_served_order_can_still_be_cancelled(api, owner):
    order = (await api.post("/api/orders", json=_order_payload(), headers=owner["headers"])).json()
    oid = order["id"]
    for target in ("preparing", "ready", "served"):
        await api.put(f"/api/orders/{oid}/status", json={"status": target}, headers=owner["headers"])

    resp = await api.delete(f"/api/orders/{oid}", headers=owner["headers"])
    assert resp.status_code == 200, resp.text


async def test_waiter_order_is_self_attributed(api, owner):
    """A waiter's own session is the only source of truth for their own orders
    (Slice 6) — no client-supplied waiter_id is trusted or needed."""
    invited = await _invite(api, owner["headers"], role="waiter", name="Ravi")
    waiter = await _login_as(api, invited)

    order = await api.post("/api/orders", json=_order_payload(), headers=waiter["headers"])
    assert order.status_code == 200, order.text
    assert order.json()["waiter_id"] == invited["id"]
    assert order.json()["waiter_name"] == "Ravi"


async def test_manager_can_place_a_counter_order_for_a_waiter(api, owner):
    """Owner/manager sessions still use the explicit waiter_id/waiter_name —
    placing a counter order on someone else's behalf."""
    invited = await _invite(api, owner["headers"], role="waiter", name="Ravi")
    payload = _order_payload()
    payload["waiter_id"] = invited["id"]
    payload["waiter_name"] = invited["name"]

    order = await api.post("/api/orders", json=payload, headers=owner["headers"])
    assert order.status_code == 200, order.text
    assert order.json()["waiter_id"] == invited["id"]
    assert order.json()["waiter_name"] == "Ravi"


async def test_dine_in_order_occupies_and_frees_table(api, owner):
    # Create a floor + table (real UUID-backed table — the canonical model).
    floor = (await api.post("/api/floors", json={"name": "Ground"}, headers=owner["headers"])).json()
    table = (
        await api.post(
            "/api/tables",
            json={"name": "T1", "floor_id": floor["id"], "capacity": 4},
            headers=owner["headers"],
        )
    ).json()

    order = (
        await api.post("/api/orders", json=_order_payload(table["id"]), headers=owner["headers"])
    ).json()

    tables = (await api.get("/api/tables", headers=owner["headers"])).json()
    assert tables[0]["status"] == "occupied"
    assert tables[0]["current_order_id"] == order["id"]

    # Cancelling frees the table.
    await api.delete(f"/api/orders/{order['id']}", headers=owner["headers"])
    tables = (await api.get("/api/tables", headers=owner["headers"])).json()
    assert tables[0]["status"] == "available"
    assert tables[0]["current_order_id"] is None
