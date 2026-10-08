"""UPI auto-settlement: dynamic QR, static-QR amount matching, webhook
signature/idempotency, and the staff review queue."""
import json

from app.services.payments.gateways import MockGateway, upi_intent

LATTE = {"menu_item_id": "m1", "menu_item_name": "Latte", "quantity": 2, "price": 100}
MOCHA = {"menu_item_id": "m2", "menu_item_name": "Mocha", "quantity": 1, "price": 200}
# Cafe default tax is 2.5% CGST + 2.5% SGST → 2 lattes = 200 + 10 = 210.


async def _enable_upi(api, owner, **extra):
    resp = await api.put(
        "/api/payments/settings",
        json={"enabled": True, "provider": "mock", "vpa": "cafe@ybl", "payee_name": "Test Cafe", **extra},
        headers=owner["headers"],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _table_with_order(api, owner, name, items):
    floor = (await api.post("/api/floors", json={"name": f"F{name}"}, headers=owner["headers"])).json()
    table = (await api.post(
        "/api/tables", json={"name": name, "floor_id": floor["id"], "capacity": 4}, headers=owner["headers"]
    )).json()
    order = (await api.post(
        "/api/orders", json={"table_id": table["id"], "items": items}, headers=owner["headers"]
    )).json()
    return table, order


async def _qr(api, owner, table, order, items):
    resp = await api.post(
        "/api/payments/requests",
        json={"table_id": table["id"], "order_id": order["id"], "items": items, "customer_name": "Asha"},
        headers=owner["headers"],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _simulate(api, owner, amount, reference=None, txn=None):
    body = {"amount": amount}
    if reference:
        body["reference"] = reference
    if txn:
        body["transaction_id"] = txn
    resp = await api.post("/api/payments/mock/simulate", json=body, headers=owner["headers"])
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _table(api, owner, table_id):
    tables = (await api.get("/api/tables", headers=owner["headers"])).json()
    return next(t for t in tables if t["id"] == table_id)


def test_upi_intent_format():
    link = upi_intent("cafe@ybl", "Test Cafe", 380, "T4-ABC123")
    assert link == "upi://pay?pa=cafe%40ybl&pn=Test%20Cafe&am=380.00&cu=INR&tr=T4-ABC123&tn=Bill%20T4-ABC123"


async def test_settings_hide_secret(api, owner):
    view = await _enable_upi(api, owner, webhook_secret="s3cret")
    assert view["webhook_secret_set"] is True
    assert "s3cret" not in json.dumps(view)
    assert view["webhook_path"] == f"/api/payments/webhook/mock/{owner['cafe_id']}"


async def test_settings_default_to_mock_provider(api, owner):
    resp = await api.put(
        "/api/payments/settings", json={"enabled": True, "vpa": "cafe@ybl"}, headers=owner["headers"]
    )
    assert resp.json()["provider"] == "mock"
    table, order = await _table_with_order(api, owner, "T1", [LATTE])
    req = await _qr(api, owner, table, order, [LATTE])
    assert (await _simulate(api, owner, 210, reference=req["reference"]))["status"] == "settled"


async def test_request_requires_upi_enabled(api, owner):
    table, order = await _table_with_order(api, owner, "T1", [LATTE])
    resp = await api.post(
        "/api/payments/requests",
        json={"table_id": table["id"], "order_id": order["id"], "items": [LATTE]},
        headers=owner["headers"],
    )
    assert resp.status_code == 400


async def test_dynamic_qr_payment_settles_table(api, owner):
    await _enable_upi(api, owner)
    table, order = await _table_with_order(api, owner, "T4", [LATTE])
    req = await _qr(api, owner, table, order, [LATTE])
    assert req["amount"] == 210
    assert req["reference"].startswith("TT4-")
    assert f"tr={req['reference']}" in req["qr_payload"]

    result = await _simulate(api, owner, 210, reference=req["reference"])
    assert result["status"] == "settled"

    # Bill created as UPI with the request id, table freed, request marked paid.
    bill = (await api.get(f"/api/bills/{req['id']}", headers=owner["headers"])).json()
    assert bill["payment_method"] == "upi" and bill["total"] == 210
    assert bill["customer_name"] == "Asha"
    assert (await _table(api, owner, table["id"]))["status"] == "available"
    got = (await api.get(f"/api/payments/requests/{req['id']}", headers=owner["headers"])).json()
    assert got["status"] == "paid" and got["bill_id"] == req["id"]


async def test_webhook_retry_is_idempotent(api, owner):
    await _enable_upi(api, owner)
    table, order = await _table_with_order(api, owner, "T4", [LATTE])
    req = await _qr(api, owner, table, order, [LATTE])
    first = await _simulate(api, owner, 210, reference=req["reference"], txn="TXN_1")
    again = await _simulate(api, owner, 210, reference=req["reference"], txn="TXN_1")
    assert first["status"] == "settled"
    assert again["duplicate"] is True
    bills = (await api.get("/api/bills", headers=owner["headers"])).json()
    assert len(bills) == 1


async def test_webhook_rejects_bad_signature(api, owner):
    await _enable_upi(api, owner, webhook_secret="right-secret")
    raw = json.dumps({"transactionId": "T", "amount": 210, "status": "SUCCESS"}).encode()
    url = f"/api/payments/webhook/mock/{owner['cafe_id']}"
    bad = await api.post(url, content=raw, headers=MockGateway().sign(raw, "wrong-secret"))
    assert bad.status_code == 401
    missing = await api.post(url, content=raw)
    assert missing.status_code == 401
    good = await api.post(url, content=raw, headers=MockGateway().sign(raw, "right-secret"))
    assert good.status_code == 200, good.text


async def test_failed_payment_is_ignored(api, owner):
    await _enable_upi(api, owner, webhook_secret="k")
    table, _ = await _table_with_order(api, owner, "T1", [LATTE])
    raw = json.dumps({"transactionId": "T9", "amount": 210, "status": "FAILED"}).encode()
    resp = await api.post(
        f"/api/payments/webhook/mock/{owner['cafe_id']}", content=raw, headers=MockGateway().sign(raw, "k")
    )
    assert resp.json()["status"] == "ignored"
    assert (await _table(api, owner, table["id"]))["status"] == "occupied"


async def test_dynamic_qr_amount_mismatch_goes_to_review(api, owner):
    await _enable_upi(api, owner)
    table, order = await _table_with_order(api, owner, "T4", [LATTE])
    req = await _qr(api, owner, table, order, [LATTE])
    result = await _simulate(api, owner, 200, reference=req["reference"])
    assert result["status"] == "needs_review"
    assert (await _table(api, owner, table["id"]))["status"] == "occupied"
    queue = (await api.get("/api/payments?status=needs_review", headers=owner["headers"])).json()
    assert queue[0]["review_reason"] == "amount_mismatch"
    assert queue[0]["candidate_table_ids"] == [table["id"]]


async def test_order_edited_after_qr_goes_to_review(api, owner):
    await _enable_upi(api, owner)
    table, order = await _table_with_order(api, owner, "T4", [LATTE])
    req = await _qr(api, owner, table, order, [LATTE])
    await api.put(f"/api/orders/{order['id']}", json={"items": [LATTE, MOCHA]}, headers=owner["headers"])
    result = await _simulate(api, owner, 210, reference=req["reference"])
    assert result["status"] == "needs_review"
    queue = (await api.get("/api/payments?status=needs_review", headers=owner["headers"])).json()
    assert queue[0]["review_reason"] == "order_changed"


async def test_manual_settle_retires_qr(api, owner):
    await _enable_upi(api, owner)
    table, order = await _table_with_order(api, owner, "T4", [LATTE])
    req = await _qr(api, owner, table, order, [LATTE])
    resp = await api.post(
        "/api/bills",
        json={"table_id": table["id"], "order_id": order["id"], "items": [LATTE], "payment_method": "cash"},
        headers=owner["headers"],
    )
    assert resp.status_code == 200
    got = (await api.get(f"/api/payments/requests/{req['id']}", headers=owner["headers"])).json()
    assert got["status"] == "cancelled"
    # A late scan of the old QR must not create a second bill.
    result = await _simulate(api, owner, 210, reference=req["reference"])
    assert result["status"] == "needs_review"
    assert len((await api.get("/api/bills", headers=owner["headers"])).json()) == 1


async def test_static_qr_unique_amount_auto_settles(api, owner):
    await _enable_upi(api, owner)
    t1, _ = await _table_with_order(api, owner, "T1", [LATTE])   # 210
    await _table_with_order(api, owner, "T2", [MOCHA])   # 210
    t3, _ = await _table_with_order(api, owner, "T3", [LATTE, MOCHA])  # 420
    result = await _simulate(api, owner, 420)
    assert result["status"] == "settled"
    assert (await _table(api, owner, t3["id"]))["status"] == "available"
    assert (await _table(api, owner, t1["id"]))["status"] == "occupied"


async def test_static_qr_ambiguous_amount_asks_staff(api, owner):
    await _enable_upi(api, owner)
    t1, _ = await _table_with_order(api, owner, "T2", [LATTE])  # 210
    t2, _ = await _table_with_order(api, owner, "T7", [MOCHA])  # 210
    result = await _simulate(api, owner, 210)
    assert result["status"] == "needs_review"
    payment = (await api.get("/api/payments?status=needs_review", headers=owner["headers"])).json()[0]
    assert payment["review_reason"] == "multiple_matches"
    assert set(payment["candidate_table_ids"]) == {t1["id"], t2["id"]}

    # Staff picks Table 7.
    resp = await api.post(
        f"/api/payments/{payment['id']}/assign", json={"table_id": t2["id"]}, headers=owner["headers"]
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "settled"
    assert (await _table(api, owner, t2["id"]))["status"] == "available"
    assert (await _table(api, owner, t1["id"]))["status"] == "occupied"
    # Assigning twice is refused.
    again = await api.post(
        f"/api/payments/{payment['id']}/assign", json={"table_id": t1["id"]}, headers=owner["headers"]
    )
    assert again.status_code == 409


async def test_static_qr_no_match_can_be_dismissed(api, owner):
    await _enable_upi(api, owner)
    await _table_with_order(api, owner, "T1", [LATTE])
    result = await _simulate(api, owner, 999)
    assert result["status"] == "needs_review"
    pid = result["payment_id"]
    resp = await api.post(f"/api/payments/{pid}/dismiss", json={"note": "refunded"}, headers=owner["headers"])
    assert resp.status_code == 200 and resp.json()["status"] == "dismissed"
    assert (await api.get("/api/payments?status=needs_review", headers=owner["headers"])).json() == []


async def test_static_qr_matches_live_qr_amount(api, owner):
    # A customer who ignores the bill's QR and pays the counter QR instead still
    # settles that table when the amount is unique.
    await _enable_upi(api, owner)
    table, order = await _table_with_order(api, owner, "T4", [LATTE])
    req = await _qr(api, owner, table, order, [LATTE])
    result = await _simulate(api, owner, 210)
    assert result["status"] == "settled"
    got = (await api.get(f"/api/payments/requests/{req['id']}", headers=owner["headers"])).json()
    assert got["status"] == "paid"


async def test_settlement_pushes_live_events(api, owner):
    from app.services import events

    await _enable_upi(api, owner)
    table, order = await _table_with_order(api, owner, "T4", [LATTE])
    req = await _qr(api, owner, table, order, [LATTE])
    queue = events.subscribe(owner["cafe_id"])
    try:
        await _simulate(api, owner, 210, reference=req["reference"])
        got = [queue.get_nowait() for _ in range(queue.qsize())]
    finally:
        events.unsubscribe(owner["cafe_id"], queue)
    names = [e["event"] for e in got]
    assert names == ["bill_settled", "payment_settled"]
    assert got[1]["data"]["table_name"] == "T4" and got[1]["data"]["amount"] == 210
