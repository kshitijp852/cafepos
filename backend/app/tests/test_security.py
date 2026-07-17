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


async def test_staff_cannot_manage_menu(api, owner):
    """Creating a category requires an owner/superadmin role."""
    # Create a staff login (username auto-generated from name).
    staff = await api.post(
        "/api/waiters",
        json={"name": "Waiter One", "password": "waiterpass", "confirm_password": "waiterpass"},
        headers=owner["headers"],
    )
    assert staff.status_code == 200, staff.text
    username = staff.json()["username"]

    device_id = "device-abc"
    creds = {"username": username, "password": "waiterpass", "device_id": device_id}

    # First login: device not yet authorized -> pending code, no token.
    pending = await api.post("/api/waiters/login", json=creds)
    assert pending.status_code == 200, pending.text
    assert pending.json()["status"] == "pending"
    code = pending.json()["code"]

    # Manager activates the device by entering that code against this staff member.
    act = await api.post(
        "/api/waiters/devices/activate",
        json={"waiter_id": staff.json()["id"], "code": code},
        headers=owner["headers"],
    )
    assert act.status_code == 200, act.text

    # Second login: authorized -> real token.
    login = await api.post("/api/waiters/login", json=creds)
    assert login.status_code == 200, login.text
    assert login.json()["status"] == "active"
    staff_headers = {"Authorization": f"Bearer {login.json()['token']}"}

    # Staff token is valid for reads but forbidden from managing the menu.
    read = await api.get("/api/menu/items", headers=staff_headers)
    assert read.status_code == 200
    write = await api.post("/api/menu/categories", json={"name": "X"}, headers=staff_headers)
    assert write.status_code == 403


async def test_health_reports_connected(api):
    resp = await api.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["database"] == "connected"
