"""Platform-admin cafe approval: /api/admin/cafes list + approve/reject."""
import uuid


async def _pending_cafe(api) -> str:
    """A real (non-test-code) signup, which starts "pending". Returns cafe_id."""
    email = f"m_{uuid.uuid4().hex[:8]}@example.com"
    start = await api.post("/api/auth/register/start", json={
        "name": "Real Owner", "phone": "+919876543210", "email": email,
        "cafe_name": "Real Cafe", "gst_number": "22AAAAA0000A1Z5",
        "password": "password123", "confirm_password": "password123",
    })
    otp = start.json()["dev_otp"]
    verify = await api.post("/api/auth/register/verify", json={"email": email, "otp": otp})
    return verify.json()["user"]["cafe_id"]


async def test_non_platform_admin_cannot_reach_admin_endpoints(api, owner, make_user):
    manager = await make_user("manager")
    for headers in (owner["headers"], manager["headers"]):
        assert (await api.get("/api/admin/cafes", headers=headers)).status_code == 403


async def test_list_cafes_filters_by_status(api, owner, make_user):
    admin = await make_user("platform_admin", in_cafe=False)
    pending_id = await _pending_cafe(api)

    pending = await api.get("/api/admin/cafes?status=pending", headers=admin["headers"])
    assert pending.status_code == 200, pending.text
    assert any(c["id"] == pending_id for c in pending.json())
    # The owner fixture's cafe is a test account — already approved, not pending.
    assert all(c["id"] != owner["cafe_id"] for c in pending.json())

    approved = await api.get("/api/admin/cafes?status=approved", headers=admin["headers"])
    assert any(c["id"] == owner["cafe_id"] for c in approved.json())


async def test_approve_cafe_unblocks_it(api, make_user):
    admin = await make_user("platform_admin", in_cafe=False)
    cafe_id = await _pending_cafe(api)

    approve = await api.post(f"/api/admin/cafes/{cafe_id}/approve", headers=admin["headers"])
    assert approve.status_code == 200, approve.text
    body = approve.json()
    assert body["status"] == "approved"
    assert body["approved_by"] == admin["user_id"]
    assert body["approved_at"] is not None


async def test_reject_cafe_is_reversible(api, make_user):
    admin = await make_user("platform_admin", in_cafe=False)
    cafe_id = await _pending_cafe(api)

    reject = await api.post(f"/api/admin/cafes/{cafe_id}/reject", headers=admin["headers"])
    assert reject.status_code == 200, reject.text
    assert reject.json()["status"] == "rejected"

    approve = await api.post(f"/api/admin/cafes/{cafe_id}/approve", headers=admin["headers"])
    assert approve.status_code == 200, approve.text
    assert approve.json()["status"] == "approved"


async def test_approve_unknown_cafe_404s(api, make_user):
    admin = await make_user("platform_admin", in_cafe=False)
    resp = await api.post("/api/admin/cafes/not-a-real-id/approve", headers=admin["headers"])
    assert resp.status_code == 404
