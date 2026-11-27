"""Reusable FastAPI dependencies: authentication and role-based access control."""
from typing import Sequence

from fastapi import Depends, Header, HTTPException

from app.core.security import decode_token
from app.db.mongo import db
from app.models.common import Role


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

    # Stamp the cafe's live approval status so require_approved_cafe (and anything
    # that wants to explain itself to a pending cafe's owner) doesn't need its own
    # lookup. None for platform_admin, who belongs to no cafe.
    cafe_status = None
    if payload.get("cafe_id"):
        cafe = await db.cafes.find_one({"id": payload["cafe_id"]}, {"_id": 0, "status": 1})
        cafe_status = cafe.get("status") if cafe else None
    payload["cafe_status"] = cafe_status
    return payload


async def require_user_session(current_user: dict = Depends(get_current_user)) -> dict:
    """Alias for get_current_user, kept for its existing call sites.

    Device-paired sessions (which this used to filter out) no longer exist as
    of Slice 6 — every session now resolves to a real signed-in user, so this
    is a plain passthrough. Role checks (``require_role``) are unaffected.
    """
    return current_user


async def require_approved_cafe(current_user: dict = Depends(get_current_user)) -> dict:
    """Block every cafe-scoped action until the cafe is approved.

    A pending cafe's owner can still log in and read /profile or GET /cafe to
    see *why* they're blocked — this dependency is only wired into the tiers
    below, not into those read-only self-service endpoints. platform_admin
    belongs to no cafe and is exempt.
    """
    if current_user["role"] == Role.platform_admin.value:
        return current_user
    if current_user.get("cafe_status") != "approved":
        raise HTTPException(status_code=403, detail="Your cafe is awaiting approval.")
    return current_user


def require_role(allowed_roles: Sequence[str], *, gate_approval: bool = False):
    """Dependency factory enforcing that the caller's role is allowed.

    gate_approval=True additionally requires the caller's cafe to be approved
    (see require_approved_cafe) — set on the cafe-scoped management tiers below.
    """
    allowed = list(allowed_roles)
    dependency = require_approved_cafe if gate_approval else get_current_user

    async def role_checker(current_user: dict = Depends(dependency)) -> dict:
        if current_user["role"] not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required roles: {allowed}. Your role: {current_user['role']}",
            )
        return current_user

    return role_checker


# The permission tiers every cafe-scoped router builds on. Defined once so
# anything that must apply to "all management endpoints" (the cafe-approval
# gate, here) has a single place to hook in.
#   OWNER_ONLY       — business settings and anything a manager must not touch.
#   MANAGEMENT       — day-to-day running of the cafe: owner and manager.
#   PLATFORM_ADMIN   — the platform-operator tier; no cafe, so never approval-gated.
OWNER_ONLY = require_role([Role.owner.value], gate_approval=True)
MANAGEMENT = require_role([Role.owner.value, Role.manager.value], gate_approval=True)
PLATFORM_ADMIN = require_role([Role.platform_admin.value])
