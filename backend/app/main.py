"""FastAPI application factory: config, CORS, lifespan, routers, error handling."""
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.db.indexes import ensure_indexes
from app.db.mongo import client, db
from app.routers import (
    auth,
    bills,
    health,
    inventory,
    menu,
    orders,
    printer,
    reports,
    reservations,
    sessions,
    tables,
    waiters,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("cafepos")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes(db)
    logger.info("Cafe POS API started (db=%s); indexes ensured.", settings.db_name)
    yield
    client.close()
    logger.info("Mongo client closed.")


app = FastAPI(title="Cafe POS API", version="1.0.0", lifespan=lifespan)

# CORS — a wildcard origin is incompatible with credentialed requests, so only
# enable credentials when explicit origins are configured.
origins = settings.cors_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials="*" not in origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

api_router = APIRouter(prefix="/api")
for module in (health, auth, waiters, menu, tables, orders, bills, reservations, sessions, reports, inventory, printer):
    api_router.include_router(module.router)
app.include_router(api_router)
