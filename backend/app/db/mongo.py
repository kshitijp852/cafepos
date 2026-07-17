"""Single shared Motor client / database handle for the app."""
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import get_settings

settings = get_settings()

client: AsyncIOMotorClient = AsyncIOMotorClient(settings.mongo_url)
db = client[settings.db_name]


def get_db():
    """FastAPI dependency returning the shared database handle."""
    return db
