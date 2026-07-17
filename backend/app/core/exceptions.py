"""Global exception handling.

The FastAPI/Starlette defaults already return ``{"detail": ...}`` for
HTTPException and validation errors, which the API keeps. This adds a
catch-all so unhandled exceptions are logged and returned as a clean 500
instead of leaking a stack trace to the client.
"""
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("cafepos")


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error."})
