async def _bill(api, headers, price=100, qty=1, method="cash"):
    items = [{"menu_item_id": "m1", "menu_item_name": "Tea", "quantity": qty, "price": price}]
    r = await api.post(
        "/api/bills",
        json={"items": items, "payment_method": method, "tax_percentage": 0},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()


async def test_analytics_empty(api, owner):
    resp = await api.get("/api/reports/analytics", headers=owner["headers"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["totals"]["bills"] == 0
    assert len(body["trend_7d"]) == 7
    assert body["by_staff"] == []


async def test_analytics_aggregates(api, owner):
    await _bill(api, owner["headers"], price=100, method="cash")
    await _bill(api, owner["headers"], price=200, method="upi")

    body = (await api.get("/api/reports/analytics", headers=owner["headers"])).json()
    assert body["totals"]["bills"] == 2
    assert body["totals"]["revenue"] == 300
    assert body["today"]["bills"] == 2
    assert body["payment_breakdown"]["cash"] == 100
    assert body["payment_breakdown"]["upi"] == 200
    # Counter bills have no waiter -> leaderboard stays empty.
    assert body["by_staff"] == []
