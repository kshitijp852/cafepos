"""Unified login flow: /auth/login-start branches into OTP-first-login or
password; /auth/first-login completes the OTP path."""
from app.db.mongo import db
from app.db.serialization import to_mongo
from app.models.user import User


async def _invited_user(owner, role="waiter") -> dict:
    """A user with no password yet, as a staff invite will create (Slice 5) —
    inserted directly since no invite endpoint exists before that slice."""
    user = User(
        email=f"{role}_{user_suffix()}@example.com", name="Invitee", role=role,
        cafe_id=owner["cafe_id"], is_email_verified=False,
    )
    await db.users.insert_one(to_mongo(user))
    return {"id": user.id, "email": user.email}


_counter = 0


def user_suffix() -> str:
    global _counter
    _counter += 1
    return f"u{_counter}"


async def test_login_start_sends_otp_for_unverified_user(api, owner):
    invitee = await _invited_user(owner)
    resp = await api.post("/api/auth/login-start", json={"email": invitee["email"]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["next"] == "verify"
    assert "dev_otp" in body


async def test_login_start_returns_password_for_verified_user(api, owner):
    resp = await api.post("/api/auth/login-start", json={"email": owner["email"]})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"next": "password"}


async def test_login_start_unknown_email_looks_like_a_verify_dead_end(api):
    """No enumeration: shape matches the unverified-user branch, minus dev_otp
    (nothing was actually generated or sent)."""
    resp = await api.post("/api/auth/login-start", json={"email": "nobody@example.com"})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"next": "verify"}


async def test_first_login_completes_and_sets_password(api, owner):
    invitee = await _invited_user(owner)
    start = await api.post("/api/auth/login-start", json={"email": invitee["email"]})
    otp = start.json()["dev_otp"]

    done = await api.post("/api/auth/first-login", json={
        "email": invitee["email"], "otp": otp,
        "password": "newpass123", "confirm_password": "newpass123",
    })
    assert done.status_code == 200, done.text
    assert done.json()["token"]
    assert done.json()["user"]["is_email_verified"] is True

    # Now a returning user: login-start says "password", and the password works.
    again = await api.post("/api/auth/login-start", json={"email": invitee["email"]})
    assert again.json() == {"next": "password"}
    login = await api.post("/api/auth/login", json={"email": invitee["email"], "password": "newpass123"})
    assert login.status_code == 200, login.text


async def test_first_login_wrong_otp_rejected(api, owner):
    invitee = await _invited_user(owner)
    await api.post("/api/auth/login-start", json={"email": invitee["email"]})

    bad = await api.post("/api/auth/first-login", json={
        "email": invitee["email"], "otp": "000000",
        "password": "newpass123", "confirm_password": "newpass123",
    })
    assert bad.status_code == 400


async def test_first_login_unknown_email_rejected(api):
    resp = await api.post("/api/auth/first-login", json={
        "email": "nobody@example.com", "otp": "123456",
        "password": "newpass123", "confirm_password": "newpass123",
    })
    assert resp.status_code == 400


async def test_first_login_mismatched_passwords_rejected(api, owner):
    invitee = await _invited_user(owner)
    start = await api.post("/api/auth/login-start", json={"email": invitee["email"]})
    otp = start.json()["dev_otp"]

    resp = await api.post("/api/auth/first-login", json={
        "email": invitee["email"], "otp": otp,
        "password": "newpass123", "confirm_password": "different1",
    })
    assert resp.status_code == 422
