"""The role taxonomy and the two permission tiers built on it.

Roles: platform_admin, owner, manager, waiter, kitchen.
  * OWNER_ONLY  — owner
  * MANAGEMENT  — owner and manager
  * /profile    — every signed-in role (the cafe it returns is read-only)
"""
import pytest

from app.db.mongo import db
from app.models.common import Role

RESERVATION = {
    "table_id": "t-1", "customer_name": "X", "customer_phone": "9876543210",
    "guest_count": 2, "reservation_date": "2026-01-01", "reservation_time": "19:00",
}
BILL = {"items": [{"menu_item_id": "m1", "menu_item_name": "Tea", "quantity": 1, "price": 40}]}

# Endpoints that need no prior state, so any 403 can only come from the role gate.
MANAGEMENT_CALLS = [
    ("post", "/api/floors", {"name": "Ground"}),
    ("post", "/api/menu/categories", {"name": "Coffee"}),
    ("get", "/api/inventory", None),
    ("get", "/api/sessions/current", None),
    ("post", "/api/sessions/open", {"opening_cash": 100}),
    ("get", "/api/bills", None),
    ("post", "/api/bills", BILL),
    ("post", "/api/reservations", RESERVATION),
    ("get", "/api/reconciliation", None),
    ("get", "/api/staff", None),
]
OWNER_ONLY_CALLS = [
    ("patch", "/api/cafe", {"name": "Renamed"}),
]
# Everything a floor role (waiter/kitchen) legitimately reads.
FLOOR_READS = ["/api/floors", "/api/tables", "/api/menu/items", "/api/menu/categories",
               "/api/orders", "/api/cafe", "/api/reservations"]


async def _call(api, headers, call):
    method, path, body = call
    kwargs = {"headers": headers}
    if body is not None:
        kwargs["json"] = body
    return await getattr(api, method)(path, **kwargs)


def test_role_set_is_exactly_the_five_roles():
    assert {r.value for r in Role} == {"platform_admin", "owner", "manager", "waiter", "kitchen"}


# ---- Management tier: owner + manager ----

@pytest.mark.parametrize("role", ["owner", "manager"])
@pytest.mark.parametrize("call", MANAGEMENT_CALLS, ids=lambda c: f"{c[0]} {c[1]}")
async def test_owner_and_manager_reach_management_endpoints(api, owner, make_user, role, call):
    user = owner if role == "owner" else await make_user(role)
    resp = await _call(api, user["headers"], call)
    assert resp.status_code == 200, f"{role} {call[1]} -> {resp.status_code} {resp.text}"


@pytest.mark.parametrize("role", ["waiter", "kitchen", "platform_admin"])
@pytest.mark.parametrize("call", MANAGEMENT_CALLS + OWNER_ONLY_CALLS, ids=lambda c: f"{c[0]} {c[1]}")
async def test_other_roles_are_kept_out_of_management_and_owner_endpoints(api, make_user, role, call):
    user = await make_user(role, in_cafe=role != "platform_admin")
    resp = await _call(api, user["headers"], call)
    assert resp.status_code == 403, f"{role} {call[1]} -> {resp.status_code} {resp.text}"


async def test_void_bill_is_management(api, owner, make_user):
    bill = await api.post("/api/bills", json=BILL, headers=owner["headers"])
    manager = await make_user("manager")
    waiter = await make_user("waiter")

    assert (await api.post(f"/api/bills/{bill.json()['id']}/void", json={}, headers=waiter["headers"])).status_code == 403
    assert (await api.post(f"/api/bills/{bill.json()['id']}/void", json={}, headers=manager["headers"])).status_code == 200


async def test_manager_can_manage_the_menu_and_tables(api, make_user):
    manager = await make_user("manager")
    floor = (await api.post("/api/floors", json={"name": "Ground"}, headers=manager["headers"])).json()
    tables = await api.post(
        "/api/tables/bulk", json={"floor_id": floor["id"], "count": 2}, headers=manager["headers"]
    )
    assert tables.status_code == 200, tables.text
    cat = await api.post("/api/menu/categories", json={"name": "Coffee"}, headers=manager["headers"])
    item = await api.post(
        "/api/menu/items",
        json={"name": "Latte", "price": 130, "category_id": cat.json()["id"]},
        headers=manager["headers"],
    )
    assert item.status_code == 200, item.text


# ---- Owner-only tier ----

async def test_manager_cannot_edit_cafe_settings_but_owner_can(api, owner, make_user):
    manager = await make_user("manager")
    denied = await api.patch("/api/cafe", json={"name": "Hijacked"}, headers=manager["headers"])
    assert denied.status_code == 403
    assert (await api.get("/api/cafe", headers=owner["headers"])).json()["name"] == "Test Cafe"

    allowed = await api.patch("/api/cafe", json={"name": "Renamed"}, headers=owner["headers"])
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["name"] == "Renamed"


# ---- The removed roles grant nothing ----

@pytest.mark.parametrize("role", ["superadmin", "staff"])
@pytest.mark.parametrize("call", MANAGEMENT_CALLS + OWNER_ONLY_CALLS, ids=lambda c: f"{c[0]} {c[1]}")
async def test_removed_roles_are_not_privileged(api, make_user, role, call):
    """Stray rows still carrying a retired role must not keep any authority."""
    user = await make_user(role)
    resp = await _call(api, user["headers"], call)
    assert resp.status_code == 403, f"{role} {call[1]} -> {resp.status_code} {resp.text}"


# ---- Floor roles keep what they need ----

@pytest.mark.parametrize("role", ["waiter", "kitchen"])
@pytest.mark.parametrize("path", FLOOR_READS)
async def test_floor_roles_can_read_floor_data(api, make_user, role, path):
    user = await make_user(role)
    resp = await api.get(path, headers=user["headers"])
    assert resp.status_code == 200, f"{role} {path} -> {resp.status_code} {resp.text}"


# ---- Roster ----

async def test_roster_lists_waiters_kitchen_and_managers_but_not_the_owner(api, owner, make_user):
    waiter = await make_user("waiter")
    kitchen = await make_user("kitchen")
    manager = await make_user("manager")

    listed = await api.get("/api/staff", headers=owner["headers"])
    assert listed.status_code == 200, listed.text
    assert {u["id"] for u in listed.json()} == {waiter["user_id"], kitchen["user_id"], manager["user_id"]}


async def test_roster_does_not_cross_cafes(api, owner, make_user):
    await make_user("waiter")
    other = await api.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123", "name": "B", "cafe_name": "Cafe B"},
    )
    other_headers = {"Authorization": f"Bearer {other.json()['token']}"}
    assert (await api.get("/api/staff", headers=other_headers)).json() == []


# ---- /profile: open to every signed-in role ----

@pytest.mark.parametrize("role", ["owner", "manager", "waiter", "kitchen"])
async def test_profile_is_open_to_every_cafe_role(api, owner, make_user, role):
    user = owner if role == "owner" else await make_user(role)

    got = await api.get("/api/profile", headers=user["headers"])
    assert got.status_code == 200, got.text
    assert got.json()["user"]["email"] == user["email"]
    assert got.json()["cafe"]["id"] == owner["cafe_id"]

    upd = await api.patch("/api/profile", json={"name": "Renamed Self"}, headers=user["headers"])
    assert upd.status_code == 200, upd.text
    assert upd.json()["name"] == "Renamed Self"

    pw = await api.post(
        "/api/profile/password",
        json={"current_password": "password123", "password": "newpass123", "confirm_password": "newpass123"},
        headers=user["headers"],
    )
    assert pw.status_code == 200, pw.text
    login = await api.post("/api/auth/login", json={"email": user["email"], "password": "newpass123"})
    assert login.status_code == 200


async def test_profile_only_edits_the_callers_own_account(api, owner, make_user):
    waiter = await make_user("waiter")
    await api.patch("/api/profile", json={"name": "Mine"}, headers=waiter["headers"])
    assert (await db.users.find_one({"id": owner["user_id"]}))["name"] == "Owner"


async def test_profile_cafe_matches_get_cafe_for_non_owners(api, make_user):
    """Bundling the cafe into /profile exposes nothing GET /cafe doesn't."""
    waiter = await make_user("waiter")
    via_profile = (await api.get("/api/profile", headers=waiter["headers"])).json()["cafe"]
    via_cafe = (await api.get("/api/cafe", headers=waiter["headers"])).json()
    assert via_profile == via_cafe


async def test_gst_required_is_only_ever_flagged_to_the_owner(api, owner, make_user):
    # A real (non-test) cafe with no GST on file.
    await db.cafes.update_one({"id": owner["cafe_id"]}, {"$set": {"is_test_account": False, "gst_number": None}})
    manager = await make_user("manager")
    waiter = await make_user("waiter")

    assert (await api.get("/api/profile", headers=owner["headers"])).json()["gst_required"] is True
    # Only the owner can fill it in, so nobody else is nagged about it.
    assert (await api.get("/api/profile", headers=manager["headers"])).json()["gst_required"] is False
    assert (await api.get("/api/profile", headers=waiter["headers"])).json()["gst_required"] is False


async def test_platform_admin_profile_has_no_cafe(api, make_user):
    admin = await make_user("platform_admin", in_cafe=False)

    resp = await api.get("/api/profile", headers=admin["headers"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["user"]["role"] == "platform_admin"
    assert body["user"]["cafe_id"] is None
    assert body["cafe"] is None
    assert body["gst_required"] is False

    upd = await api.patch("/api/profile", json={"name": "Admin Person"}, headers=admin["headers"])
    assert upd.status_code == 200, upd.text
