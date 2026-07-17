async def _make_floor(api, headers, name="Ground"):
    resp = await api.post("/api/floors", json={"name": name}, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_bulk_create_tables(api, owner):
    floor = await _make_floor(api, owner["headers"])
    resp = await api.post(
        "/api/tables/bulk",
        json={"floor_id": floor["id"], "count": 5, "capacity": 4, "prefix": "T", "start": 1},
        headers=owner["headers"],
    )
    assert resp.status_code == 200, resp.text
    names = sorted(t["name"] for t in resp.json())
    assert names == ["T1", "T2", "T3", "T4", "T5"]
    assert all(t["capacity"] == 4 and t["floor_id"] == floor["id"] for t in resp.json())


async def test_bulk_skips_existing_names(api, owner):
    floor = await _make_floor(api, owner["headers"])
    await api.post(
        "/api/tables/bulk",
        json={"floor_id": floor["id"], "count": 3, "prefix": "T", "start": 1},
        headers=owner["headers"],
    )
    # Overlapping run (T1..T3 exist) → only T4, T5 are created.
    resp = await api.post(
        "/api/tables/bulk",
        json={"floor_id": floor["id"], "count": 5, "prefix": "T", "start": 1},
        headers=owner["headers"],
    )
    assert resp.status_code == 200
    assert sorted(t["name"] for t in resp.json()) == ["T4", "T5"]

    total = await api.get("/api/tables", headers=owner["headers"])
    assert len(total.json()) == 5


async def test_delete_table(api, owner):
    floor = await _make_floor(api, owner["headers"])
    t = await api.post(
        "/api/tables",
        json={"name": "T1", "floor_id": floor["id"], "capacity": 2},
        headers=owner["headers"],
    )
    tid = t.json()["id"]

    d = await api.delete(f"/api/tables/{tid}", headers=owner["headers"])
    assert d.status_code == 200, d.text
    assert all(x["id"] != tid for x in (await api.get("/api/tables", headers=owner["headers"])).json())


async def test_delete_occupied_table_blocked(api, owner):
    floor = await _make_floor(api, owner["headers"])
    t = await api.post(
        "/api/tables",
        json={"name": "T2", "floor_id": floor["id"], "capacity": 2},
        headers=owner["headers"],
    )
    tid = t.json()["id"]
    await api.put(f"/api/tables/{tid}", json={"status": "occupied"}, headers=owner["headers"])

    d = await api.delete(f"/api/tables/{tid}", headers=owner["headers"])
    assert d.status_code == 400


async def test_bulk_rejects_foreign_floor(api, owner):
    resp = await api.post(
        "/api/tables/bulk",
        json={"floor_id": "does-not-exist", "count": 2},
        headers=owner["headers"],
    )
    assert resp.status_code == 404
