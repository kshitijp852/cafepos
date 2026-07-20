import uuid

import pytest

from app.core.config import get_settings

GST = "22AAAAA0000A1Z5"


def _signup_body(**over):
    body = {
        "name": "Manager",
        "phone": "+919876543210",
        "email": f"m_{uuid.uuid4().hex[:8]}@example.com",
        "cafe_name": "Cafe GST",
        "password": "password123",
        "confirm_password": "password123",
    }
    body.update(over)
    return body


@pytest.fixture
def test_code():
    """Enable the test-account bypass for the duration of one test."""
    settings = get_settings()
    original = settings.test_signup_code
    settings.test_signup_code = "let-me-in"
    yield "let-me-in"
    settings.test_signup_code = original


async def test_signup_requires_gst(api):
    resp = await api.post("/api/auth/register/start", json=_signup_body())
    assert resp.status_code == 400
    assert "GST" in resp.json()["detail"]


async def test_signup_rejects_malformed_gst(api):
    resp = await api.post("/api/auth/register/start", json=_signup_body(gst_number="NOPE"))
    assert resp.status_code == 422


async def test_signup_with_gst_stores_it_on_the_cafe(api):
    body = _signup_body(gst_number="22aaaaa0000a1z5")  # lower case is normalized
    start = await api.post("/api/auth/register/start", json=body)
    assert start.status_code == 200, start.text

    verify = await api.post(
        "/api/auth/register/verify", json={"email": body["email"], "otp": start.json()["dev_otp"]}
    )
    assert verify.status_code == 200, verify.text
    headers = {"Authorization": f"Bearer {verify.json()['token']}"}

    cafe = (await api.get("/api/cafe", headers=headers)).json()
    assert cafe["gst_number"] == GST
    assert cafe["is_test_account"] is False


async def test_test_code_skips_gst(api, test_code):
    body = _signup_body(test_code=test_code)
    start = await api.post("/api/auth/register/start", json=body)
    assert start.status_code == 200, start.text

    verify = await api.post(
        "/api/auth/register/verify", json={"email": body["email"], "otp": start.json()["dev_otp"]}
    )
    assert verify.status_code == 200, verify.text
    headers = {"Authorization": f"Bearer {verify.json()['token']}"}

    cafe = (await api.get("/api/cafe", headers=headers)).json()
    assert cafe["gst_number"] is None
    assert cafe["is_test_account"] is True


async def test_wrong_test_code_rejected(api, test_code):
    resp = await api.post("/api/auth/register/start", json=_signup_body(test_code="guessed"))
    assert resp.status_code == 400
    assert "test access code" in resp.json()["detail"].lower()


async def test_test_code_rejected_when_unconfigured(api):
    resp = await api.post("/api/auth/register/start", json=_signup_body(test_code="anything"))
    assert resp.status_code == 400


async def test_profile_returns_user_cafe_and_gst_flag(api, owner):
    resp = await api.get("/api/profile", headers=owner["headers"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["user"]["email"] == owner["email"]
    assert body["cafe"]["id"] == owner["cafe_id"]
    # The legacy /register path creates a test cafe, so no GST is outstanding.
    assert body["gst_required"] is False


async def test_profile_update_and_password_change(api, owner):
    upd = await api.patch(
        "/api/profile", headers=owner["headers"], json={"name": "New Name", "phone": "9876543210"}
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["name"] == "New Name"
    assert upd.json()["phone"] == "9876543210"

    bad = await api.post(
        "/api/profile/password",
        headers=owner["headers"],
        json={"current_password": "wrong", "password": "newpass123", "confirm_password": "newpass123"},
    )
    assert bad.status_code == 400

    ok = await api.post(
        "/api/profile/password",
        headers=owner["headers"],
        json={
            "current_password": "password123",
            "password": "newpass123",
            "confirm_password": "newpass123",
        },
    )
    assert ok.status_code == 200, ok.text
    assert (await api.post("/api/auth/login", json={"email": owner["email"], "password": "newpass123"})).status_code == 200


async def test_real_cafe_cannot_clear_gst(api):
    body = _signup_body(gst_number=GST)
    start = await api.post("/api/auth/register/start", json=body)
    verify = await api.post(
        "/api/auth/register/verify", json={"email": body["email"], "otp": start.json()["dev_otp"]}
    )
    headers = {"Authorization": f"Bearer {verify.json()['token']}"}

    cleared = await api.patch("/api/cafe", headers=headers, json={"gst_number": ""})
    assert cleared.status_code == 400

    # Replacing it with another valid GSTIN is fine.
    changed = await api.patch("/api/cafe", headers=headers, json={"gst_number": "29AAAAA0000A1Z5"})
    assert changed.status_code == 200, changed.text
    assert changed.json()["gst_number"] == "29AAAAA0000A1Z5"
