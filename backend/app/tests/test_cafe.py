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
    assert c["gst_number"] == "22AAAAA0000A1Z5"  # normalized to upper case


async def test_blank_detail_clears_field(api, owner):
    await api.patch("/api/cafe", json={"address": "somewhere"}, headers=owner["headers"])
    resp = await api.patch("/api/cafe", json={"address": "   "}, headers=owner["headers"])
    assert resp.status_code == 200
    assert resp.json()["address"] is None


async def test_empty_name_rejected(api, owner):
    resp = await api.patch("/api/cafe", json={"name": "  "}, headers=owner["headers"])
    assert resp.status_code == 400


async def test_settings_are_owner_only_for_staff(api, owner):
    from .test_staff import _invite, _login_as

    invited = await _invite(api, owner["headers"], role="waiter", name="Floor Waiter")
    waiter = await _login_as(api, invited)

    resp = await api.patch("/api/cafe", json={"name": "Hack"}, headers=waiter["headers"])
    assert resp.status_code == 403
