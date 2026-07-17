from fastapi import APIRouter, HTTPException

from app.db.mongo import db

router = APIRouter(tags=["health"])


@router.get("/")
async def root():
    return {"message": "Cafe POS API v1.0", "status": "running"}


@router.get("/health")
async def health_check():
    """Report healthy only if MongoDB actually responds to a ping."""
    try:
        await db.command("ping")
    except Exception:
        raise HTTPException(status_code=503, detail={"status": "unhealthy", "database": "unreachable"})
    return {"status": "healthy", "database": "connected"}
