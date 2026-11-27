"""What a waiter/kitchen session may and may not reach.

Before Slice 6 this scope was keyed on "is this a paired device"; now it's keyed
on role (waiter/kitchen vs owner/manager) since device-pairing is gone and a
waiter logs in as themselves. Money, reporting, and destructive actions need
a management role (app/core/deps.py::MANAGEMENT / OWNER_ONLY).
"""
import pytest

from .test_staff import _invite, _login_as


@pytest.fixture
async def device(api, owner):
    """A waiter's own signed-in session — named `device` to keep this file's
    diff small; it plays the role the paired tablet used to."""
    invited = await _invite(api, owner["headers"], role="waiter", name="Floor Waiter")
    return (await _login_as(api, invited))["headers"]


async def _menu_item(api, owner):
    cat = await api.post("/api/menu/categories", json={"name": "Coffee"}, headers=owner["headers"])
    item = await api.post(
        "/api/menu/items",
        json={"name": "Latte", "price": 150, "category_id": cat.json()["id"]},
        headers=owner["headers"],
    )
    return item.json()


# ---- Allowed: everything the floor actually needs ----

@pytest.mark.parametrize(
    "path",
    ["/api/menu/items", "/api/menu/categories", "/api/tables", "/api/floors",
     "/api/orders", "/api/cafe", "/api/reservations"],
)
async def test_waiter_can_read_floor_data(api, device, path):
    resp = await api.get(path, headers=device)
    assert resp.status_code == 200, f"{path} -> {resp.status_code} {resp.text}"


async def test_waiter_can_take_and_advance_an_order(api, owner, device):
    item = await _menu_item(api, owner)
    items = [{
        "menu_item_id": item["id"], "menu_item_name": item["name"],
        "quantity": 1, "price": item["price"],
    }]

    created = await api.post("/api/orders", json={"items": items, "status": "pending"}, headers=device)
    assert created.status_code == 200, created.text
    order_id = created.json()["id"]

    # Add a round, then fire it and mark it served — the full waiter loop.
    assert (await api.put(f"/api/orders/{order_id}", json={"items": items}, headers=device)).status_code == 200
    assert (await api.put(f"/api/orders/{order_id}/status", json={"status": "preparing"}, headers=device)).status_code == 200
    assert (await api.put(f"/api/orders/{order_id}/status", json={"status": "ready"}, headers=device)).status_code == 200

    # And print its ticket.
    kot = await api.post("/api/printer/kot", params={"order_id": order_id}, headers=device)
    assert kot.status_code == 200, kot.text


# ---- Denied: money, reporting, destructive ----

async def test_waiter_cannot_settle_a_bill(api, owner, device):
    """Settling is a manager action — a waiter must not take payment."""
    item = await _menu_item(api, owner)
    resp = await api.post(
        "/api/bills",
        json={
            "items": [{
                "menu_item_id": item["id"], "menu_item_name": item["name"],
                "quantity": 1, "price": item["price"],
            }],
            "payment_method": "cash",
        },
        headers=device,
    )
    assert resp.status_code == 403, resp.text


async def test_waiter_cannot_cancel_an_order(api, owner, device):
    item = await _menu_item(api, owner)
    created = await api.post(
        "/api/orders",
        json={"items": [{
            "menu_item_id": item["id"], "menu_item_name": item["name"],
            "quantity": 1, "price": item["price"],
        }]},
        headers=device,
    )
    order_id = created.json()["id"]
    assert (await api.delete(f"/api/orders/{order_id}", headers=device)).status_code == 403


@pytest.mark.parametrize(
    "path",
    ["/api/bills", "/api/reports/daily", "/api/reports/analytics",
     "/api/inventory", "/api/sessions/current", "/api/sessions/history"],
)
async def test_waiter_cannot_read_money_or_reports(api, device, path):
    resp = await api.get(path, headers=device)
    assert resp.status_code == 403, f"{path} -> {resp.status_code} {resp.text}"


async def test_waiter_cannot_open_or_close_the_day(api, device):
    assert (await api.post("/api/sessions/open", json={"opening_cash": 500}, headers=device)).status_code == 403


async def test_waiter_cannot_claim_invoice_serials(api, device):
    """Offline invoice serials belong to a billing device, not a waiter."""
    resp = await api.post("/api/bills/series/claim", json={}, headers=device)
    assert resp.status_code == 403, resp.text


async def test_waiter_cannot_write_reservations(api, owner, device):
    """Reads stay open — a waiter needs to see who a reserved table is held for."""
    assert (await api.get("/api/reservations", headers=device)).status_code == 200
    resp = await api.post(
        "/api/reservations",
        json={
            "table_id": "whatever", "customer_name": "X", "customer_phone": "9876543210",
            "guest_count": 2, "reservation_date": "2026-01-01", "reservation_time": "19:00",
        },
        headers=device,
    )
    assert resp.status_code == 403, resp.text


async def test_manager_still_reaches_everything(api, owner):
    """The lockdown must not catch real signed-in users."""
    for path in ("/api/bills", "/api/reports/daily", "/api/inventory", "/api/sessions/current"):
        resp = await api.get(path, headers=owner["headers"])
        assert resp.status_code == 200, f"{path} -> {resp.status_code} {resp.text}"
