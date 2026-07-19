async def test_printer_requires_auth(api, owner):
    # Create a bill to target.
    bill = await api.post(
        "/api/bills",
        json={"items": [{"menu_item_id": "m1", "menu_item_name": "Tea", "quantity": 1, "price": 40}]},
        headers=owner["headers"],
    )
    bill_id = bill.json()["id"]

    # Unauthenticated print is rejected (was previously wide open).
    unauth = await api.post(f"/api/printer/bill?bill_id={bill_id}")
    assert unauth.status_code == 401

    # Authenticated print works.
    authed = await api.post(f"/api/printer/bill?bill_id={bill_id}", headers=owner["headers"])
    assert authed.status_code == 200


async def test_device_cannot_manage_menu(api, owner):
    """A paired ordering device has the staff role: it can read the menu but not
    manage it (owner/superadmin only)."""
    device_id = "device-abc"
    code = (await api.post("/api/waiters/devices/request", json={"device_id": device_id})).json()["code"]
    act = await api.post("/api/waiters/devices/activate", json={"code": code}, headers=owner["headers"])
    assert act.status_code == 200, act.text
    poll = await api.post("/api/waiters/devices/poll", json={"device_id": device_id, "code": code})
    assert poll.json()["status"] == "active"
    device_headers = {"Authorization": f"Bearer {poll.json()['token']}"}

    # Device token is valid for reads but forbidden from managing the menu.
    read = await api.get("/api/menu/items", headers=device_headers)
    assert read.status_code == 200
    write = await api.post("/api/menu/categories", json={"name": "X"}, headers=device_headers)
    assert write.status_code == 403


async def test_health_reports_connected(api):
    resp = await api.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["database"] == "connected"
