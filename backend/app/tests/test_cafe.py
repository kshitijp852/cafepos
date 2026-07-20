async def test_get_cafe(api, owner):
    resp = await api.get("/api/cafe", headers=owner["headers"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Test Cafe"


async def test_update_restaurant_details(api, owner):
    resp = await api.patch(
        "/api/cafe",
        json={"name": "My Diner", "phone": "98765 43210", "address": "12 MG Road", "gst_number": "22aaaaa0000a1z5"},
        headers=owner["headers"],
    )
    assert resp.status_code == 200, resp.text
    c = resp.json()
    assert c["name"] == "My Diner"
    assert c["phone"] == "98765 43210"
    assert c["address"] == "12 MG Road"
    assert c["gst_number"] == "22aaaaa0000a1z5"


async def test_blank_detail_clears_field(api, owner):
    await api.patch("/api/cafe", json={"address": "somewhere"}, headers=owner["headers"])
    resp = await api.patch("/api/cafe", json={"address": "   "}, headers=owner["headers"])
    assert resp.status_code == 200
    assert resp.json()["address"] is None


async def test_empty_name_rejected(api, owner):
    resp = await api.patch("/api/cafe", json={"name": "  "}, headers=owner["headers"])
    assert resp.status_code == 400


async def test_settings_require_manager(api, owner):
    # Pair a device (staff role) and confirm it cannot edit cafe settings.
    code = (await api.post("/api/waiters/devices/request", json={"device_id": "d-set"})).json()["code"]
    await api.post("/api/waiters/devices/activate", json={"code": code}, headers=owner["headers"])
    poll = await api.post("/api/waiters/devices/poll", json={"device_id": "d-set", "code": code})
    device_headers = {"Authorization": f"Bearer {poll.json()['token']}"}

    resp = await api.patch("/api/cafe", json={"name": "Hack"}, headers=device_headers)
    assert resp.status_code == 403
