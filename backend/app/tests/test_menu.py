async def _make_category(api, headers, name="Beverages"):
    resp = await api.post("/api/menu/categories", json={"name": name}, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_category_and_item_crud(api, owner):
    cat = await _make_category(api, owner["headers"])
    item = await api.post(
        "/api/menu/items",
        json={"name": "Latte", "price": 130, "category_id": cat["id"]},
        headers=owner["headers"],
    )
    assert item.status_code == 200, item.text
    assert item.json()["cafe_id"] == owner["cafe_id"]

    listing = await api.get("/api/menu/items", headers=owner["headers"])
    assert listing.status_code == 200
    assert len(listing.json()) == 1


async def test_item_requires_existing_category(api, owner):
    resp = await api.post(
        "/api/menu/items",
        json={"name": "Ghost", "price": 10, "category_id": "does-not-exist"},
        headers=owner["headers"],
    )
    assert resp.status_code == 404


async def test_menu_purge_requires_otp(api, owner):
    cat = await _make_category(api, owner["headers"])
    await api.post(
        "/api/menu/items",
        json={"name": "Latte", "price": 130, "category_id": cat["id"]},
        headers=owner["headers"],
    )

    # Request the confirmation code (DEV mode returns it).
    req = await api.post("/api/menu/purge/request", headers=owner["headers"])
    assert req.status_code == 200, req.text
    assert req.json()["item_count"] == 1
    otp = req.json()["dev_otp"]

    # Wrong code is rejected and deletes nothing.
    bad = await api.post("/api/menu/purge/confirm", json={"otp": "000000"}, headers=owner["headers"])
    assert bad.status_code == 400
    assert len((await api.get("/api/menu/items", headers=owner["headers"])).json()) == 1

    # Correct code wipes menu items + categories.
    ok = await api.post("/api/menu/purge/confirm", json={"otp": otp}, headers=owner["headers"])
    assert ok.status_code == 200, ok.text
    assert ok.json()["deleted_items"] == 1 and ok.json()["deleted_categories"] == 1
    assert (await api.get("/api/menu/items", headers=owner["headers"])).json() == []
    assert (await api.get("/api/menu/categories", headers=owner["headers"])).json() == []


async def test_menu_purge_blocked_when_empty(api, owner):
    resp = await api.post("/api/menu/purge/request", headers=owner["headers"])
    assert resp.status_code == 400


async def test_cafe_isolation(api, owner):
    """A second cafe must not see or mutate the first cafe's data."""
    cat = await _make_category(api, owner["headers"])

    # Register a second owner (separate cafe).
    other = await api.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123", "name": "B", "cafe_name": "Cafe B"},
    )
    other_headers = {"Authorization": f"Bearer {other.json()['token']}"}

    # Second cafe sees no categories from the first.
    listing = await api.get("/api/menu/categories", headers=other_headers)
    assert listing.status_code == 200
    assert listing.json() == []

    # And cannot update the first cafe's category.
    resp = await api.put(
        f"/api/menu/categories/{cat['id']}", json={"name": "Hacked"}, headers=other_headers
    )
    assert resp.status_code == 403
