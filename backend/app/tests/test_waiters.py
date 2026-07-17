import uuid


async def _create_staff(api, headers, name="Rahul Kumar", password="waiterpass"):
    resp = await api.post(
        "/api/waiters",
        json={"name": name, "password": password, "confirm_password": password},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_username_autogen_and_collision(api, owner):
    a = await _create_staff(api, owner["headers"], name="Rahul Kumar")
    b = await _create_staff(api, owner["headers"], name="Rahul Kumar")
    assert a["username"] == "rahulkumar"
    assert b["username"] == "rahulkumar1"  # collision gets a numeric suffix


async def test_password_mismatch_rejected(api, owner):
    resp = await api.post(
        "/api/waiters",
        json={"name": "X", "password": "abcdef", "confirm_password": "different"},
        headers=owner["headers"],
    )
    assert resp.status_code == 422


async def test_pending_code_is_stable_across_polls(api, owner):
    staff = await _create_staff(api, owner["headers"])
    creds = {"username": staff["username"], "password": "waiterpass", "device_id": "dev-1"}

    first = await api.post("/api/waiters/login", json=creds)
    second = await api.post("/api/waiters/login", json=creds)
    assert first.json()["status"] == "pending"
    # Repeated logins (the device polling) must return the SAME code, not a new one.
    assert first.json()["code"] == second.json()["code"]


async def test_wrong_password_rejected(api, owner):
    staff = await _create_staff(api, owner["headers"])
    resp = await api.post(
        "/api/waiters/login",
        json={"username": staff["username"], "password": "nope", "device_id": "dev-1"},
    )
    assert resp.status_code == 401


async def test_activation_then_login_yields_token(api, owner):
    staff = await _create_staff(api, owner["headers"])
    creds = {"username": staff["username"], "password": "waiterpass", "device_id": "dev-9"}

    code = (await api.post("/api/waiters/login", json=creds)).json()["code"]
    act = await api.post(
        "/api/waiters/devices/activate",
        json={"waiter_id": staff["id"], "code": code},
        headers=owner["headers"],
    )
    assert act.status_code == 200, act.text

    login = await api.post("/api/waiters/login", json=creds)
    assert login.json()["status"] == "active"
    assert login.json()["token"] and login.json()["user"]["role"] == "staff"

    # A different device for the same staff is still pending until separately authorized.
    other = await api.post(
        "/api/waiters/login",
        json={"username": staff["username"], "password": "waiterpass", "device_id": "dev-other"},
    )
    assert other.json()["status"] == "pending"


async def test_credential_less_flow(api, owner):
    """Device gets a code with no login; manager assigns a staff; device polls to a token."""
    staff = await _create_staff(api, owner["headers"])
    device_id = "kiosk-1"

    # Device asks for a code without any credentials.
    code = (await api.post("/api/waiters/devices/request", json={"device_id": device_id})).json()["code"]

    # Repeat request returns the same code (stable while showing).
    again = (await api.post("/api/waiters/devices/request", json={"device_id": device_id})).json()["code"]
    assert again == code

    # Poll before activation -> still pending, no token.
    pending = await api.post("/api/waiters/devices/poll", json={"device_id": device_id, "code": code})
    assert pending.json()["status"] == "pending"

    # Manager activates by selecting the staff member + entering the code.
    act = await api.post(
        "/api/waiters/devices/activate",
        json={"waiter_id": staff["id"], "code": code},
        headers=owner["headers"],
    )
    assert act.status_code == 200, act.text

    # Device poll now returns a real token for the assigned staff.
    done = await api.post("/api/waiters/devices/poll", json={"device_id": device_id, "code": code})
    assert done.json()["status"] == "active"
    assert done.json()["token"] and done.json()["user"]["id"] == staff["id"]


async def test_poll_unknown_code_404(api):
    resp = await api.post("/api/waiters/devices/poll", json={"device_id": "x", "code": "ZZZZ-ZZZZ-ZZZZ"})
    assert resp.status_code == 404


async def test_waiter_stats(api, owner):
    staff = await _create_staff(api, owner["headers"], name="Ravi")
    items = [{"menu_item_id": "m1", "menu_item_name": "Latte", "quantity": 2, "price": 100}]

    # Waiter takes a dine-in order (attributed to the staff).
    order = await api.post(
        "/api/orders",
        json={"table_id": "t-1", "items": items, "waiter_id": staff["id"], "waiter_name": "Ravi", "status": "active"},
        headers=owner["headers"],
    )
    assert order.status_code == 200, order.text

    # Manager settles it -> the bill should inherit the waiter attribution.
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
    assert body["tables_served"] == 1
    assert body["items_sold"] == 2
    assert body["bills_count"] == 1
    assert body["revenue"] > 0
    assert len(body["recent_bills"]) == 1


async def test_deactivate_reactivate_and_delete(api, owner):
    staff = await _create_staff(api, owner["headers"])
    creds = {"username": staff["username"], "password": "waiterpass", "device_id": "dev-z"}

    # Deactivate -> stays listed but login is blocked.
    d = await api.post(f"/api/waiters/{staff['id']}/deactivate", headers=owner["headers"])
    assert d.status_code == 200
    listed = await api.get("/api/waiters", headers=owner["headers"])
    row = next(w for w in listed.json() if w["id"] == staff["id"])
    assert row["is_active"] is False
    assert (await api.post("/api/waiters/login", json=creds)).status_code == 403

    # Reactivate -> login works again (as a pending device).
    r = await api.post(f"/api/waiters/{staff['id']}/activate", headers=owner["headers"])
    assert r.status_code == 200
    assert (await api.post("/api/waiters/login", json=creds)).json()["status"] == "pending"

    # Delete -> gone from the list entirely.
    x = await api.delete(f"/api/waiters/{staff['id']}", headers=owner["headers"])
    assert x.status_code == 200
    listed2 = await api.get("/api/waiters", headers=owner["headers"])
    assert all(w["id"] != staff["id"] for w in listed2.json())


async def test_activate_bad_code_rejected(api, owner):
    staff = await _create_staff(api, owner["headers"])
    resp = await api.post(
        "/api/waiters/devices/activate",
        json={"waiter_id": staff["id"], "code": "ZZZZ-ZZZZ-ZZZZ"},
        headers=owner["headers"],
    )
    assert resp.status_code == 400


async def test_code_must_match_the_chosen_staff(api, owner):
    """A code generated by staff A must not activate when entered against staff B."""
    a = await _create_staff(api, owner["headers"], name="Staff A")
    b = await _create_staff(api, owner["headers"], name="Staff B")
    code_a = (await api.post(
        "/api/waiters/login",
        json={"username": a["username"], "password": "waiterpass", "device_id": "dev-a"},
    )).json()["code"]

    wrong = await api.post(
        "/api/waiters/devices/activate",
        json={"waiter_id": b["id"], "code": code_a},
        headers=owner["headers"],
    )
    assert wrong.status_code == 400


async def test_activation_is_cafe_scoped(api, owner):
    """A manager from another cafe cannot activate this cafe's device code."""
    staff = await _create_staff(api, owner["headers"])
    code = (await api.post(
        "/api/waiters/login",
        json={"username": staff["username"], "password": "waiterpass", "device_id": "dev-x"},
    )).json()["code"]

    other = await api.post(
        "/api/auth/register",
        json={"email": f"o_{uuid.uuid4().hex[:8]}@example.com", "password": "password123", "name": "B", "cafe_name": "Cafe B"},
    )
    other_headers = {"Authorization": f"Bearer {other.json()['token']}"}

    resp = await api.post(
        "/api/waiters/devices/activate",
        json={"waiter_id": staff["id"], "code": code},
        headers=other_headers,
    )
    assert resp.status_code == 404  # staff belongs to another cafe -> not found for this manager
