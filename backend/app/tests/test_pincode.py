import pytest

from app.core.config import get_settings
from app.routers import pincode as pincode_router

SAMPLE = [
    {"pin": 560001, "office": "Vasanthanagar S.O", "office_type": "S.O",
     "delivery": "Non-Delivery", "district": "Bangalore", "state": "Karnataka"},
    {"pin": 560001, "office": "Bangalore G.P.O. ", "office_type": "H.O",
     "delivery": "Delivery", "district": "Bangalore", "state": "Karnataka"},
    {"pin": 110001, "office": "Elsewhere S.O", "office_type": "S.O",
     "delivery": "Delivery", "district": "New Delhi", "state": "Delhi"},
]


@pytest.fixture(autouse=True)
def clear_cache():
    pincode_router._CACHE.clear()
    yield
    pincode_router._CACHE.clear()


async def test_rejects_malformed_pincode(api, owner):
    resp = await api.get("/api/pincode/12ab", headers=owner["headers"])
    assert resp.status_code == 400


async def test_requires_auth(api):
    assert (await api.get("/api/pincode/560001")).status_code == 401


async def test_unconfigured_key_reports_unavailable(api, owner):
    settings = get_settings()
    original, settings.rapidapi_key = settings.rapidapi_key, ""
    try:
        resp = await api.get("/api/pincode/560001", headers=owner["headers"])
        assert resp.status_code == 503
    finally:
        settings.rapidapi_key = original


async def test_lookup_picks_delivery_office_and_caches(api, owner, monkeypatch):
    settings = get_settings()
    original, settings.rapidapi_key = settings.rapidapi_key, "test-key"
    calls = []

    class _Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return SAMPLE

    class _Client:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json, headers):
            calls.append(json["search"])
            return _Resp()

    monkeypatch.setattr(pincode_router.httpx, "AsyncClient", _Client)
    try:
        resp = await api.get("/api/pincode/560001", headers=owner["headers"])
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # Off-pincode rows from the fuzzy upstream search are discarded.
        assert body == {
            "pincode": "560001",
            "city": "Bangalore",
            "district": "Bangalore",
            "state": "Karnataka",
            "areas": ["Bangalore G.P.O.", "Vasanthanagar S.O"],
        }

        # Second call is served from the in-process cache.
        assert (await api.get("/api/pincode/560001", headers=owner["headers"])).status_code == 200
        assert calls == ["560001"]
    finally:
        settings.rapidapi_key = original
