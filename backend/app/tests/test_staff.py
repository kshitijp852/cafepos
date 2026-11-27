import uuid


async def _invite(api, headers, role="waiter", name="Rahul Kumar"):
    email = f"{role}_{uuid.uuid4().hex[:8]}@example.com"
    resp = await api.post("/api/staff", json={"name": name, "email": email, "role": role}, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _login_as(api, invited: dict) -> dict:
    """Complete an invite's first-login so the invited staff member has a real
    signed-in session (headers), the way they would after the OTP email."""
    done = await api.post("/api/auth/first-login", json={
        "email": invited["email"], "otp": invited["dev_otp"],
        "password": "password123", "confirm_password": "password123",
    })
    assert done.status_code == 200, done.text
    return {"headers": {"Authorization": f"Bearer {done.json()['token']}"}, **invited}


# ---- Staff invite ----

async def test_invite_creates_unverified_staff_and_sends_otp(api, owner):
    invited = await _invite(api, owner["headers"], role="waiter", name="Rahul Kumar")
    assert invited["role"] == "waiter"
    assert invited["is_email_verified"] is False
    assert invited["dev_otp"]  # DEV mode: no mailbox required

    # The invite IS the first-login trigger — it completes the same way a
    # login-start-triggered OTP would.
    done = await api.post("/api/auth/first-login", json={
        "email": invited["email"], "otp": invited["dev_otp"],
        "password": "password123", "confirm_password": "password123",
    })
    assert done.status_code == 200, done.text
    assert done.json()["user"]["is_email_verified"] is True


async def test_invite_duplicate_email_rejected(api, owner):
    invited = await _invite(api, owner["headers"])
    resp = await api.post(
        "/api/staff", json={"name": "Dup", "email": invited["email"], "role": "waiter"}, headers=owner["headers"]
    )
    assert resp.status_code == 400


async def test_owner_can_invite_a_manager_but_manager_cannot(api, owner):
    manager = await _invite(api, owner["headers"], role="manager", name="Manager One")
    assert manager["role"] == "manager"

    manager_done = await api.post("/api/auth/first-login", json={
        "email": manager["email"], "otp": manager["dev_otp"],
        "password": "password123", "confirm_password": "password123",
    })
    manager_headers = {"Authorization": f"Bearer {manager_done.json()['token']}"}

    blocked = await api.post(
        "/api/staff", json={"name": "X", "email": "x@example.com", "role": "manager"}, headers=manager_headers
    )
    assert blocked.status_code == 403

    allowed = await api.post(
        "/api/staff", json={"name": "Y", "email": "y@example.com", "role": "waiter"}, headers=manager_headers
    )
    assert allowed.status_code == 200, allowed.text


async def test_resend_invite(api, owner):
    invited = await _invite(api, owner["headers"])
    resend = await api.post(f"/api/staff/{invited['id']}/resend-invite", headers=owner["headers"])
    assert resend.status_code == 200, resend.text
    assert resend.json()["dev_otp"]

    # Once verified, the invite can no longer be resent.
    await api.post("/api/auth/first-login", json={
        "email": invited["email"], "otp": resend.json()["dev_otp"],
        "password": "password123", "confirm_password": "password123",
    })
    again = await api.post(f"/api/staff/{invited['id']}/resend-invite", headers=owner["headers"])
    assert again.status_code == 400


# ---- Staff roster ----

async def test_update_staff_name(api, owner):
    invited = await _invite(api, owner["headers"], name="Old Name")
    resp = await api.patch(f"/api/staff/{invited['id']}", json={"name": "New Name"}, headers=owner["headers"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "New Name"


async def test_manager_cannot_edit_another_manager(api, owner):
    manager_a = await _invite(api, owner["headers"], role="manager", name="Manager A")
    manager_b_invite = await _invite(api, owner["headers"], role="manager", name="Manager B")
    verify = await api.post("/api/auth/first-login", json={
        "email": manager_a["email"], "otp": manager_a["dev_otp"],
        "password": "password123", "confirm_password": "password123",
    })
    manager_a_headers = {"Authorization": f"Bearer {verify.json()['token']}"}

    resp = await api.patch(
        f"/api/staff/{manager_b_invite['id']}", json={"name": "Hijacked"}, headers=manager_a_headers
    )
    assert resp.status_code == 403


async def test_staff_stats(api, owner):
    staff = await _invite(api, owner["headers"], name="Ravi")
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

    stats = await api.get(f"/api/staff/{staff['id']}/stats", headers=owner["headers"])
    assert stats.status_code == 200, stats.text
    body = stats.json()
    assert body["orders_taken"] == 1
    assert body["bills_count"] == 1
    assert body["revenue"] > 0


async def test_deactivate_reactivate_and_delete(api, owner):
    staff = await _invite(api, owner["headers"])

    d = await api.post(f"/api/staff/{staff['id']}/deactivate", headers=owner["headers"])
    assert d.status_code == 200
    row = next(w for w in (await api.get("/api/staff", headers=owner["headers"])).json() if w["id"] == staff["id"])
    assert row["is_active"] is False

    r = await api.post(f"/api/staff/{staff['id']}/activate", headers=owner["headers"])
    assert r.status_code == 200

    x = await api.delete(f"/api/staff/{staff['id']}", headers=owner["headers"])
    assert x.status_code == 200
    listed = await api.get("/api/staff", headers=owner["headers"])
    assert all(w["id"] != staff["id"] for w in listed.json())
