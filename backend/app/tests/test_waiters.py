async def _create_staff(api, headers, name="Rahul Kumar"):
    resp = await api.post("/api/waiters", json={"name": name}, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _pair_device(api, owner, device_id="dev-1", waiter_id=None, device_name=None):
    """Request a code, activate it (manager), poll to a device token. Returns the
    poll response (status + tokens + device)."""
    code = (await api.post("/api/waiters/devices/request", json={"device_id": device_id})).json()["code"]
    body = {"code": code}
    if waiter_id:
        body["waiter_id"] = waiter_id
    if device_name:
        body["device_name"] = device_name
    act = await api.post("/api/waiters/devices/activate", json=body, headers=owner["headers"])
    assert act.status_code == 200, act.text
    poll = await api.post("/api/waiters/devices/poll", json={"device_id": device_id, "code": code})
    assert poll.status_code == 200, poll.text
    return poll.json()


# ---- Staff roster ----

async def test_username_autogen_and_collision(api, owner):
    a = await _create_staff(api, owner["headers"], name="Rahul Kumar")
    b = await _create_staff(api, owner["headers"], name="Rahul Kumar")
    assert a["username"] == "rahulkumar"
    assert b["username"] == "rahulkumar1"


async def test_create_staff_needs_no_password(api, owner):
    # Name only — no password/confirm required anymore.
    resp = await api.post("/api/waiters", json={"name": "Solo Name"}, headers=owner["headers"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "staff"


async def test_update_waiter(api, owner):
    staff = await _create_staff(api, owner["headers"], name="Old Name")
    resp = await api.patch(
        f"/api/waiters/{staff['id']}", json={"name": "New Name", "username": "newhandle"}, headers=owner["headers"]
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "New Name" and resp.json()["username"] == "newhandle"


async def test_update_waiter_username_collision(api, owner):
    a = await _create_staff(api, owner["headers"], name="Aaa")
    b = await _create_staff(api, owner["headers"], name="Bbb")
    resp = await api.patch(
        f"/api/waiters/{b['id']}", json={"username": a["username"]}, headers=owner["headers"]
    )
    assert resp.status_code == 400


# ---- Device pairing ----

async def test_pairing_pending_then_active_token(api, owner):
    device_id = "dev-9"
    code = (await api.post("/api/waiters/devices/request", json={"device_id": device_id})).json()["code"]

    # Same request returns the same code while pending.
    again = (await api.post("/api/waiters/devices/request", json={"device_id": device_id})).json()["code"]
    assert again == code

    # Poll before activation -> pending, no token.
    pending = await api.post("/api/waiters/devices/poll", json={"device_id": device_id, "code": code})
    assert pending.json()["status"] == "pending"

    act = await api.post("/api/waiters/devices/activate", json={"code": code}, headers=owner["headers"])
    assert act.status_code == 200, act.text

    done = await api.post("/api/waiters/devices/poll", json={"device_id": device_id, "code": code})
    assert done.json()["status"] == "active"
    assert done.json()["token"] and done.json()["refresh_token"]
    assert done.json()["device"]["assigned_user"] is None  # ordering-only until assigned


async def test_activate_bad_code_rejected(api, owner):
    resp = await api.post(
        "/api/waiters/devices/activate", json={"code": "ZZZZ-ZZZZ-ZZZZ"}, headers=owner["headers"]
    )
    assert resp.status_code == 400


async def test_device_me_and_live_reassignment(api, owner):
    a = await _create_staff(api, owner["headers"], name="Waiter A")
    b = await _create_staff(api, owner["headers"], name="Waiter B")
    poll = await _pair_device(api, owner, device_id="dev-me", waiter_id=a["id"], device_name="Counter 1")
    headers = {"Authorization": f"Bearer {poll['token']}"}

    me = await api.get("/api/devices/me", headers=headers)
    assert me.status_code == 200, me.text
    assert me.json()["device_name"] == "Counter 1"
    assert me.json()["assigned_user"]["id"] == a["id"]

    # Manager reassigns to B — the device token sees it live (no re-pair).
    device = (await api.get("/api/waiters/devices", headers=owner["headers"])).json()[0]
    patch = await api.patch(
        f"/api/waiters/devices/{device['id']}", json={"user_id": b["id"]}, headers=owner["headers"]
    )
    assert patch.status_code == 200, patch.text
    me2 = await api.get("/api/devices/me", headers=headers)
    assert me2.json()["assigned_user"]["id"] == b["id"]

    # Clear the assignment -> ordering-only.
    await api.patch(f"/api/waiters/devices/{device['id']}", json={"user_id": None}, headers=owner["headers"])
    me3 = await api.get("/api/devices/me", headers=headers)
    assert me3.json()["assigned_user"] is None


async def test_order_attributed_from_device_assignment(api, owner):
    staff = await _create_staff(api, owner["headers"], name="Ravi")
    poll = await _pair_device(api, owner, device_id="dev-order", waiter_id=staff["id"])
    headers = {"Authorization": f"Bearer {poll['token']}"}
    items = [{"menu_item_id": "m1", "menu_item_name": "Latte", "quantity": 1, "price": 100}]

    # Client sends no waiter fields; server stamps from the device assignment.
    order = await api.post("/api/orders", json={"table_id": "t-1", "items": items, "status": "active"}, headers=headers)
    assert order.status_code == 200, order.text
    assert order.json()["waiter_id"] == staff["id"]
    assert order.json()["waiter_name"] == "Ravi"

    # Clear assignment -> subsequent orders are unattributed but still work.
    device = (await api.get("/api/waiters/devices", headers=owner["headers"])).json()[0]
    await api.patch(f"/api/waiters/devices/{device['id']}", json={"user_id": None}, headers=owner["headers"])
    order2 = await api.post("/api/orders", json={"table_id": "t-2", "items": items, "status": "active"}, headers=headers)
    assert order2.status_code == 200, order2.text
    assert order2.json()["waiter_id"] is None


async def test_logout_marks_device_logged_out(api, owner):
    poll = await _pair_device(api, owner, device_id="dev-lo")
    headers = {"Authorization": f"Bearer {poll['token']}"}

    devices = await api.get("/api/waiters/devices", headers=owner["headers"])
    assert devices.json()[0]["signed_in"] is True

    lo = await api.post("/api/waiters/devices/logout", json={"device_id": "dev-lo"}, headers=headers)
    assert lo.status_code == 200, lo.text

    devices = await api.get("/api/waiters/devices", headers=owner["headers"])
    row = devices.json()[0]
    assert row["signed_in"] is False and row["status"] == "active"
    assert row["last_logout"] is not None


async def test_revoke_device(api, owner):
    poll = await _pair_device(api, owner, device_id="dev-rev")
    headers = {"Authorization": f"Bearer {poll['token']}"}
    device = (await api.get("/api/waiters/devices", headers=owner["headers"])).json()[0]

    d = await api.delete(f"/api/waiters/devices/{device['id']}", headers=owner["headers"])
    assert d.status_code == 200
    # Device token no longer resolves once revoked.
    me = await api.get("/api/devices/me", headers=headers)
    assert me.status_code == 401


async def test_deactivate_unassigns_devices(api, owner):
    staff = await _create_staff(api, owner["headers"])
    await _pair_device(api, owner, device_id="dev-de", waiter_id=staff["id"])

    d = await api.post(f"/api/waiters/{staff['id']}/deactivate", headers=owner["headers"])
    assert d.status_code == 200
    device = (await api.get("/api/waiters/devices", headers=owner["headers"])).json()[0]
    assert device["assigned_user"] is None  # device stays paired, just unassigned


async def test_poll_unknown_code_404(api):
    resp = await api.post("/api/waiters/devices/poll", json={"device_id": "x", "code": "ZZZZ-ZZZZ-ZZZZ"})
    assert resp.status_code == 404


async def test_waiter_stats(api, owner):
    staff = await _create_staff(api, owner["headers"], name="Ravi")
    items = [{"menu_item_id": "m1", "menu_item_name": "Latte", "quantity": 2, "price": 100}]

    order = await api.post(
        "/api/orders",
        json={"table_id": "t-1", "items": items, "waiter_id": staff["id"], "waiter_name": "Ravi", "status": "active"},
        headers=owner["headers"],
    )
    assert order.status_code == 200, order.text

    bill = await api.post(
        "/api/bills",
        json={"table_id": "t-1", "items": items, "payment_method": "cash", "order_id": order.json()["id"]},
        headers=owner["headers"],
    )
    assert bill.status_code == 200, bill.text
    assert bill.json()["waiter_id"] == staff["id"]

    stats = await api.get(f"/api/waiters/{staff['id']}/stats", headers=owner["headers"])
    assert stats.status_code == 200, stats.text
    body = stats.json()
    assert body["orders_taken"] == 1
    assert body["bills_count"] == 1
    assert body["revenue"] > 0


async def test_deactivate_reactivate_and_delete(api, owner):
    staff = await _create_staff(api, owner["headers"])

    d = await api.post(f"/api/waiters/{staff['id']}/deactivate", headers=owner["headers"])
    assert d.status_code == 200
    row = next(w for w in (await api.get("/api/waiters", headers=owner["headers"])).json() if w["id"] == staff["id"])
    assert row["is_active"] is False

    r = await api.post(f"/api/waiters/{staff['id']}/activate", headers=owner["headers"])
    assert r.status_code == 200

    x = await api.delete(f"/api/waiters/{staff['id']}", headers=owner["headers"])
    assert x.status_code == 200
    listed = await api.get("/api/waiters", headers=owner["headers"])
    assert all(w["id"] != staff["id"] for w in listed.json())
