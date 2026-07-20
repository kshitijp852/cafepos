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

    # Device tokens carry a device_id and no user identity of their own. Resolve
    # the current assignment live, so reassigning the device takes effect at once.
    if payload.get("device_id") and not payload.get("user_id"):
        device = await db.device_activations.find_one(
            {"device_id": payload["device_id"], "status": "active"}, {"_id": 0}
        )
        if not device:
            raise HTTPException(status_code=401, detail="Device is no longer authorized.")
        return {
            "cafe_id": device["cafe_id"],
            "role": "staff",
            "device_id": device["device_id"],
            "user_id": device.get("user_id"),
        }

    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user or not user.get("is_active"):
        raise HTTPException(status_code=401, detail="User not found or deactivated.")
    return payload


async def require_user_session(current_user: dict = Depends(get_current_user)) -> dict:
    """Reject waiter-device sessions; allow real signed-in users.

    A device token is issued to a tablet on the floor, not to a person: it is
    long-lived, its holder is whoever is carrying the device, and a manager
    reassigns who it belongs to without the device re-authenticating. That is the
    right trade for taking orders and wrong for anything else, so money,
    reporting, and destructive actions require a user session.

    Role checks (``require_role``) are a separate axis and still apply — this
    only answers "is a person behind this request".
    """
    if current_user.get("device_id"):
        raise HTTPException(
            status_code=403,
            detail="This action isn't available on a waiter device.",
        )
    return current_user


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
