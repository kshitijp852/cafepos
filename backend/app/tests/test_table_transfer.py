"""Moving a sitting between tables, and what a floor device may change."""
import pytest

from .test_waiters import _pair_device


@pytest.fixture
async def device(api, owner):
    poll = await _pair_device(api, owner, device_id="dev-tables")
    return {"Authorization": f"Bearer {poll['token']}"}


async def _floor_with_tables(api, owner, count=2):
    floor = await api.post("/api/floors", json={"name": "Ground Floor"}, headers=owner["headers"])
    tables = await api.post(
        "/api/tables/bulk",
        json={"floor_id": floor.json()["id"], "count": count, "capacity": 4},
        headers=owner["headers"],
    )
    return tables.json()


async def _seat(api, owner, headers, table_id):
    """Put an order on a table, which is what marks it occupied."""
    cat = await api.post("/api/menu/categories", json={"name": "Food"}, headers=owner["headers"])
    item = await api.post(
        "/api/menu/items",
        json={"name": "Dosa", "price": 90, "category_id": cat.json()["id"]},
        headers=owner["headers"],
    )
    item = item.json()
    resp = await api.post(
        "/api/orders",
        json={
            "table_id": table_id,
            "status": "pending",
            "items": [{
                "menu_item_id": item["id"], "menu_item_name": item["name"],
                "quantity": 2, "price": item["price"],
            }],
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_transfer_moves_order_and_frees_source(api, owner, device):
    t1, t2 = await _floor_with_tables(api, owner)
    order = await _seat(api, owner, device, t1["id"])

    resp = await api.post(
        f"/api/tables/{t1['id']}/transfer", json={"to_table_id": t2["id"]}, headers=device
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["current_order_id"] == order["id"]
    assert resp.json()["status"] == "occupied"

    tables = {t["id"]: t for t in (await api.get("/api/tables", headers=device)).json()}
    assert tables[t1["id"]]["status"] == "available"
    assert tables[t1["id"]]["current_order_id"] is None
    assert tables[t1["id"]]["seated_at"] is None

    orders = (await api.get("/api/orders", params={"status": "pending"}, headers=device)).json()
    moved = next(o for o in orders if o["id"] == order["id"])
    assert moved["table_id"] == t2["id"]


async def test_transfer_preserves_the_dwell_clock(api, owner, device):
    """A move must not reset how long the guests have been sitting."""
    t1, t2 = await _floor_with_tables(api, owner)
    await _seat(api, owner, device, t1["id"])

    before = {t["id"]: t for t in (await api.get("/api/tables", headers=device)).json()}
    seated_at = before[t1["id"]]["seated_at"]
    assert seated_at is not None

    resp = await api.post(
        f"/api/tables/{t1['id']}/transfer", json={"to_table_id": t2["id"]}, headers=device
    )
    assert resp.json()["seated_at"] == seated_at


async def test_transfer_rejects_an_occupied_destination(api, owner, device):
    t1, t2 = await _floor_with_tables(api, owner)
    await _seat(api, owner, device, t1["id"])
    await _seat(api, owner, device, t2["id"])

    resp = await api.post(
        f"/api/tables/{t1['id']}/transfer", json={"to_table_id": t2["id"]}, headers=device
    )
    assert resp.status_code == 409, resp.text


async def test_transfer_needs_an_open_order(api, owner, device):
    t1, t2 = await _floor_with_tables(api, owner)
    resp = await api.post(
        f"/api/tables/{t1['id']}/transfer", json={"to_table_id": t2["id"]}, headers=device
    )
    assert resp.status_code == 400, resp.text


async def test_transfer_rejects_the_same_table(api, owner, device):
    t1, _ = await _floor_with_tables(api, owner)
    await _seat(api, owner, device, t1["id"])
    resp = await api.post(
        f"/api/tables/{t1['id']}/transfer", json={"to_table_id": t1["id"]}, headers=device
    )
    assert resp.status_code == 400, resp.text


# ---- What a device may change on a table ----

async def test_device_can_free_a_table(api, owner, device):
    t1, _ = await _floor_with_tables(api, owner)
    await _seat(api, owner, device, t1["id"])
    resp = await api.put(f"/api/tables/{t1['id']}", json={"status": "available"}, headers=device)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "available"


@pytest.mark.parametrize("body", [{"name": "VIP"}, {"capacity": 12}])
async def test_device_cannot_restructure_a_table(api, owner, device, body):
    """Renaming or resizing is a layout decision, not a service one."""
    t1, _ = await _floor_with_tables(api, owner)
    resp = await api.put(f"/api/tables/{t1['id']}", json=body, headers=device)
    assert resp.status_code == 403, resp.text


async def test_manager_can_still_rename_a_table(api, owner):
    t1, _ = await _floor_with_tables(api, owner)
    resp = await api.put(f"/api/tables/{t1['id']}", json={"name": "VIP"}, headers=owner["headers"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "VIP"
