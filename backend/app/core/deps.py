"""Reusable FastAPI dependencies: authentication and role-based access control."""
from typing import Sequence

from fastapi import Depends, Header, HTTPException

from app.core.security import decode_token
from app.db.mongo import db


async def get_current_user(authorization: str = Header(None)) -> dict:
    """Decode the Bearer access token and confirm the user is still active.

    Returns the JWT payload: ``{"user_id", "cafe_id", "role", ...}``.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required.")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authorization header must be 'Bearer <token>'.")

    payload = decode_token(parts[1], expected_type="access")
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user or not user.get("is_active"):
        raise HTTPException(status_code=401, detail="User not found or deactivated.")
    return payload


def require_role(allowed_roles: Sequence[str]):
    """Dependency factory enforcing that the caller's role is allowed."""
    allowed = list(allowed_roles)

    async def role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required roles: {allowed}. Your role: {current_user['role']}",
            )
        return current_user

    return role_checker
