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


async def test_waiter_cannot_manage_menu(api, owner):
    """A waiter holds no management role: they can read the menu but not
    manage it (owner/manager only)."""
    from .test_staff import _invite, _login_as

    invited = await _invite(api, owner["headers"], role="waiter", name="Floor Waiter")
    waiter = await _login_as(api, invited)

    # A waiter's own session is valid for reads but forbidden from managing the menu.
    read = await api.get("/api/menu/items", headers=waiter["headers"])
    assert read.status_code == 200
    write = await api.post("/api/menu/categories", json={"name": "X"}, headers=waiter["headers"])
    assert write.status_code == 403


async def test_health_reports_connected(api):
    resp = await api.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["database"] == "connected"
