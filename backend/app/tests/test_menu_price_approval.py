"""Menu price-change approval queue: a manager's price edit is held for owner
approval; every other field still applies at once."""
from .test_staff import _invite, _login_as


async def _category_and_item(api, headers, price=100):
    cat = await api.post("/api/menu/categories", json={"name": "Coffee"}, headers=headers)
    item = await api.post(
        "/api/menu/items",
        json={"name": "Latte", "price": price, "category_id": cat.json()["id"]},
        headers=headers,
    )
    return item.json()


async def _manager(api, owner):
    invited = await _invite(api, owner["headers"], role="manager", name="Manager One")
    return await _login_as(api, invited)


async def test_owner_price_update_applies_immediately(api, owner):
    item = await _category_and_item(api, owner["headers"])
    resp = await api.put(
        f"/api/menu/items/{item['id']}",
        json={**item, "price": 150},
        headers=owner["headers"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["price"] == 150
    assert "price_change_status" not in resp.json()


async def test_manager_price_change_is_held_for_approval(api, owner):
    item = await _category_and_item(api, owner["headers"])
    manager = await _manager(api, owner)

    resp = await api.put(
        f"/api/menu/items/{item['id']}",
        json={**item, "price": 150},
        headers=manager["headers"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["price"] == 100  # unchanged — still live/authoritative
    assert resp.json()["price_change_status"] == "pending_approval"

    items = await api.get("/api/menu/items", headers=owner["headers"])
    assert next(i for i in items.json() if i["id"] == item["id"])["price"] == 100


async def test_manager_can_still_edit_other_fields_freely(api, owner):
    """Only a real price change is held — editing something else goes straight
    through, same as an owner's edit."""
    item = await _category_and_item(api, owner["headers"])
    manager = await _manager(api, owner)

    resp = await api.put(
        f"/api/menu/items/{item['id']}",
        json={**item, "name": "Renamed Latte"},
        headers=manager["headers"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Renamed Latte"
    assert "price_change_status" not in resp.json()

    pending = await api.get("/api/menu/price-requests?status=pending", headers=owner["headers"])
    assert pending.json() == []


async def test_owner_approves_price_request(api, owner):
    item = await _category_and_item(api, owner["headers"])
    manager = await _manager(api, owner)
    await api.put(f"/api/menu/items/{item['id']}", json={**item, "price": 150}, headers=manager["headers"])

    pending = (await api.get("/api/menu/price-requests?status=pending", headers=owner["headers"])).json()
    assert len(pending) == 1
    request = pending[0]
    assert request["current_price"] == 100 and request["proposed_price"] == 150

    approve = await api.post(f"/api/menu/price-requests/{request['id']}/approve", headers=owner["headers"])
    assert approve.status_code == 200, approve.text
    assert approve.json()["status"] == "approved"
    assert approve.json()["resolved_by"] == owner["user_id"]

    items = await api.get("/api/menu/items", headers=owner["headers"])
    assert next(i for i in items.json() if i["id"] == item["id"])["price"] == 150

    # Already resolved — can't be resolved again.
    again = await api.post(f"/api/menu/price-requests/{request['id']}/approve", headers=owner["headers"])
    assert again.status_code == 400


async def test_owner_rejects_price_request(api, owner):
    item = await _category_and_item(api, owner["headers"])
    manager = await _manager(api, owner)
    await api.put(f"/api/menu/items/{item['id']}", json={**item, "price": 150}, headers=manager["headers"])

    request = (await api.get("/api/menu/price-requests?status=pending", headers=owner["headers"])).json()[0]
    reject = await api.post(f"/api/menu/price-requests/{request['id']}/reject", headers=owner["headers"])
    assert reject.status_code == 200, reject.text
    assert reject.json()["status"] == "rejected"

    items = await api.get("/api/menu/items", headers=owner["headers"])
    assert next(i for i in items.json() if i["id"] == item["id"])["price"] == 100


async def test_manager_cannot_reach_price_request_endpoints(api, owner):
    item = await _category_and_item(api, owner["headers"])
    manager = await _manager(api, owner)
    await api.put(f"/api/menu/items/{item['id']}", json={**item, "price": 150}, headers=manager["headers"])
    request = (await api.get("/api/menu/price-requests?status=pending", headers=owner["headers"])).json()[0]

    assert (await api.get("/api/menu/price-requests", headers=manager["headers"])).status_code == 403
    assert (await api.post(
        f"/api/menu/price-requests/{request['id']}/approve", headers=manager["headers"]
    )).status_code == 403
    assert (await api.post(
        f"/api/menu/price-requests/{request['id']}/reject", headers=manager["headers"]
    )).status_code == 403
