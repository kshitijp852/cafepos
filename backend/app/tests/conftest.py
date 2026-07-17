"""Test fixtures. Runs against an isolated test database that is wiped between
tests, so no real data is touched. Requires a MongoDB reachable at MONGO_URL.
"""
import os
import uuid

# Force an isolated test DB and guarantee required settings exist BEFORE the app
# (and its settings singleton) are imported below.
os.environ["DB_NAME"] = os.environ.get("TEST_DB_NAME", "cafepos_test")
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production-0123456789abcdef")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
# Force DEV email mode in tests: never hit real SMTP, and surface dev_otp /
# dev_reset_url in responses so OTP flows are testable. Overrides any .env creds.
os.environ["SMTP_USER"] = ""
os.environ["SMTP_APP_PASSWORD"] = ""

import asyncio

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.db.indexes import ensure_indexes
from app.db.mongo import db
from app.main import app


@pytest.fixture(scope="session")
def event_loop():
    """One event loop for the whole session so the shared Motor client (bound to
    the loop on first use) stays valid across every test."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


async def _wipe():
    for name in await db.list_collection_names():
        await db[name].delete_many({})


@pytest_asyncio.fixture(autouse=True)
async def clean_db():
    await _wipe()
    await ensure_indexes(db)
    yield
    await _wipe()


@pytest_asyncio.fixture
async def api():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def owner(api):
    """Register a fresh owner and return {client-usable headers, tokens, ids}."""
    email = f"owner_{uuid.uuid4().hex[:8]}@example.com"
    resp = await api.post(
        "/api/auth/register",
        json={"email": email, "password": "password123", "name": "Owner", "cafe_name": "Test Cafe"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return {
        "email": email,
        "token": data["token"],
        "refresh_token": data["refresh_token"],
        "cafe_id": data["user"]["cafe_id"],
        "user_id": data["user"]["id"],
        "headers": {"Authorization": f"Bearer {data['token']}"},
    }
