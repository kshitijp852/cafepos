"""Backwards-compatible entrypoint.

The application now lives in the ``app`` package (app.main:app). This shim keeps
the historical ``server:app`` import path working for existing run commands.
Prefer ``uvicorn app.main:app`` going forward.
"""
from app.main import app

__all__ = ["app"]
