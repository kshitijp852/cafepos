import uuid


async def test_register_returns_tokens(api):
    email = f"u_{uuid.uuid4().hex[:8]}@example.com"
    resp = await api.post(
        "/api/auth/register",
        json={"email": email, "password": "password123", "name": "A", "cafe_name": "Cafe A"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["token"] and body["refresh_token"]
    assert body["user"]["role"] == "owner"
    assert body["user"]["cafe_id"]


async def test_duplicate_email_rejected(api, owner):
    resp = await api.post(
        "/api/auth/register",
        json={"email": owner["email"], "password": "password123", "name": "A", "cafe_name": "Dup"},
    )
    assert resp.status_code == 400


async def test_login_and_bad_credentials(api, owner):
    ok = await api.post("/api/auth/login", json={"email": owner["email"], "password": "password123"})
    assert ok.status_code == 200
    assert ok.json()["token"]

    bad = await api.post("/api/auth/login", json={"email": owner["email"], "password": "wrong"})
    assert bad.status_code == 401


async def test_refresh_flow(api, owner):
    resp = await api.post("/api/auth/refresh", json={"refresh_token": owner["refresh_token"]})
    assert resp.status_code == 200
    assert resp.json()["token"]

    # An access token must not be accepted where a refresh token is required.
    bad = await api.post("/api/auth/refresh", json={"refresh_token": owner["token"]})
    assert bad.status_code == 401


async def test_protected_route_requires_token(api):
    resp = await api.get("/api/menu/categories")
    assert resp.status_code == 401


async def test_otp_signup_flow(api):
    email = f"m_{uuid.uuid4().hex[:8]}@example.com"
    body = {
        "name": "Manager", "phone": "+919876543210", "email": email,
        "cafe_name": "Cafe OTP", "gst_number": "22AAAAA0000A1Z5",
        "password": "password123", "confirm_password": "password123",
    }
    start = await api.post("/api/auth/register/start", json=body)
    assert start.status_code == 200, start.text
    otp = start.json()["dev_otp"]  # DEV mode returns the code

    # No user should exist yet (verify-then-create).
    assert (await api.post("/api/auth/login", json={"email": email, "password": "password123"})).status_code == 401

    bad = await api.post("/api/auth/register/verify", json={"email": email, "otp": "000000"})
    assert bad.status_code == 400

    ok = await api.post("/api/auth/register/verify", json={"email": email, "otp": otp})
    assert ok.status_code == 200, ok.text
    assert ok.json()["token"] and ok.json()["user"]["phone"] == "+919876543210"

    # Now login works with the chosen password.
    assert (await api.post("/api/auth/login", json={"email": email, "password": "password123"})).status_code == 200


async def test_signup_rejects_mismatched_password(api):
    email = f"m_{uuid.uuid4().hex[:8]}@example.com"
    resp = await api.post("/api/auth/register/start", json={
        "name": "M", "phone": "9876543210", "email": email,
        "cafe_name": "C", "password": "password123", "confirm_password": "different1",
    })
    assert resp.status_code == 422


async def test_signup_rejects_bad_phone(api):
    email = f"m_{uuid.uuid4().hex[:8]}@example.com"
    resp = await api.post("/api/auth/register/start", json={
        "name": "M", "phone": "123", "email": email,
        "cafe_name": "C", "password": "password123", "confirm_password": "password123",
    })
    assert resp.status_code == 422


async def test_password_reset_flow(api, owner):
    req = await api.post("/api/auth/reset/request", json={"email": owner["email"]})
    assert req.status_code == 200
    reset_url = req.json()["dev_reset_url"]
    token = reset_url.split("token=")[1]

    confirm = await api.post("/api/auth/reset/confirm", json={
        "token": token, "password": "newpass123", "confirm_password": "newpass123",
    })
    assert confirm.status_code == 200, confirm.text

    # Old password rejected, new one works.
    assert (await api.post("/api/auth/login", json={"email": owner["email"], "password": "password123"})).status_code == 401
    assert (await api.post("/api/auth/login", json={"email": owner["email"], "password": "newpass123"})).status_code == 200

    # Token is single-use.
    reuse = await api.post("/api/auth/reset/confirm", json={
        "token": token, "password": "another123", "confirm_password": "another123",
    })
    assert reuse.status_code == 400


async def test_reset_request_unknown_email_is_generic(api):
    resp = await api.post("/api/auth/reset/request", json={"email": "nobody@example.com"})
    assert resp.status_code == 200
    # No reset material handed out for a non-existent account.
    assert "dev_reset_url" not in resp.json()
