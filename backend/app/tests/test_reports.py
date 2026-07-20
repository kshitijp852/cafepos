import uuid


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


async def test_analytics_chart_series(api, owner):
    await _bill(api, owner["headers"], price=100, method="cash")

    body = (await api.get("/api/reports/analytics", headers=owner["headers"])).json()
    assert len(body["trend_daily"]) == 90
    assert body["trend_daily"][-1]["bills"] == 1
    assert body["trend_daily"][-1]["avg_bill"] == 100
    assert len(body["by_hour"]) == 24
    assert len(body["by_weekday"]) == 7
    assert sum(h["bills"] for h in body["by_hour"]) == 1
    assert sum(w["revenue"] for w in body["by_weekday"]) == 100
    # No packing/delivery charge -> counted as dine-in.
    assert body["order_types"]["dine_in"] == {"revenue": 100, "bills": 1}
    assert body["order_types"]["delivery"]["bills"] == 0
    # Counter bills carry no dwell time.
    assert body["dwell"]["sampled_bills"] == 0
    assert body["top_items_revenue"][0] == {"name": "Tea", "qty": 1, "revenue": 100}


async def _bill_with_customer(api, headers, phone, name="Regular", price=100):
    items = [{"menu_item_id": "m1", "menu_item_name": "Tea", "quantity": 1, "price": price}]
    r = await api.post(
        "/api/bills",
        json={
            "items": items,
            "payment_method": "cash",
            "tax_percentage": 0,
            "customer_name": name,
            "customer_phone": phone,
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()


async def test_customer_insights(api, owner):
    # One repeat customer, one first-timer, one anonymous bill.
    await _bill_with_customer(api, owner["headers"], "9876543210", "Kavya", price=100)
    await _bill_with_customer(api, owner["headers"], "9876543210", "Kavya", price=300)
    await _bill_with_customer(api, owner["headers"], "9000000001", "Rahul", price=200)
    await _bill(api, owner["headers"], price=50)

    body = (await api.get("/api/reports/customers?tz_offset=330", headers=owner["headers"])).json()
    t = body["totals"]
    assert t["bills"] == 4
    assert t["identified_bills"] == 3
    assert t["customers"] == 2
    assert t["repeat_customers"] == 1
    assert t["identified_revenue"] == 600
    assert t["unidentified_revenue"] == 50
    # Kavya's two visits are 400 of the 600 identified.
    assert t["repeat_revenue_share"] == round(400 / 600 * 100, 1)

    top = body["top_customers"][0]
    assert top["name"] == "Kavya"
    assert top["visits"] == 2
    assert top["avg_bill"] == 200
    assert top["days_since"] == 0

    buckets = {b["label"]: b["count"] for b in body["visit_buckets"]}
    assert buckets["1 visit"] == 1
    assert buckets["2 visits"] == 1

    today = body["new_vs_returning"][-1]
    assert today["new"] == 2 and today["returning"] == 1
    # Nobody can be lapsed on their first day.
    assert body["recent_lapsed"] == []


async def test_customer_insights_is_scoped_to_the_callers_cafe(api, owner):
    await _bill_with_customer(api, owner["headers"], "9876543210", "Kavya")

    # A second cafe must not see the first cafe's customer book.
    other_email = f"owner_{uuid.uuid4().hex[:8]}@example.com"
    resp = await api.post(
        "/api/auth/register",
        json={"email": other_email, "password": "password123", "name": "Other", "cafe_name": "Other Cafe"},
    )
    other_headers = {"Authorization": f"Bearer {resp.json()['token']}"}
    await _bill_with_customer(api, other_headers, "9111111111", "Stranger")

    mine = (await api.get("/api/reports/customers", headers=owner["headers"])).json()
    theirs = (await api.get("/api/reports/customers", headers=other_headers)).json()
    assert [c["name"] for c in mine["top_customers"]] == ["Kavya"]
    assert [c["name"] for c in theirs["top_customers"]] == ["Stranger"]


async def test_analytics_tz_offset_shifts_buckets(api, owner):
    await _bill(api, owner["headers"], price=100)

    utc = (await api.get("/api/reports/analytics", headers=owner["headers"])).json()
    # A whole-hour offset moves the bill's hour bucket by exactly that many
    # hours (a half-hour zone like IST would depend on the minute it ran).
    shifted = (await api.get("/api/reports/analytics?tz_offset=120", headers=owner["headers"])).json()
    utc_hour = next(h["hour"] for h in utc["by_hour"] if h["bills"] == 1)
    shifted_hour = next(h["hour"] for h in shifted["by_hour"] if h["bills"] == 1)
    assert shifted_hour == (utc_hour + 2) % 24
    assert shifted["totals"]["revenue"] == utc["totals"]["revenue"] == 100
