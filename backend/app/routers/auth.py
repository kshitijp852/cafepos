from datetime import timedelta

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.core.email import otp_email, reset_email, send_email
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_otp,
    generate_reset_token,
    get_password_hash,
    hash_token,
    is_expired,
    verify_password,
)
from app.db.mongo import db
from app.db.serialization import to_mongo
from app.models.cafe import Cafe
from app.models.common import Role, utcnow
from app.models.user import (
    AuthResponse,
    RegisterStart,
    RegisterVerify,
    ResetConfirm,
    ResetRequest,
    TokenRefresh,
    User,
    UserCreate,
    UserLogin,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _issue(user: User) -> AuthResponse:
    return AuthResponse(
        user=user,
        token=create_access_token(user.id, user.cafe_id, user.role),
        refresh_token=create_refresh_token(user.id, user.cafe_id, user.role),
    )


async def _create_owner_and_cafe(*, email: str, name: str, cafe_name: str, password: str,
                                 phone: str | None = None) -> User:
    """Create the cafe + owner user pair used by both signup paths."""
    cafe = Cafe(name=cafe_name)
    await db.cafes.insert_one(to_mongo(cafe))

    user = User(email=email, name=name, phone=phone, cafe_id=cafe.id, role=Role.owner.value)
    user_doc = to_mongo(user)
    user_doc["password"] = get_password_hash(password)
    await db.users.insert_one(user_doc)
    return user


@router.post("/register", response_model=AuthResponse)
async def register(payload: UserCreate):
    """Legacy single-call signup (no email verification). Kept for automation/tests."""
    if await db.users.find_one({"email": payload.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = await _create_owner_and_cafe(
        email=payload.email, name=payload.name, cafe_name=payload.cafe_name, password=payload.password
    )
    return _issue(user)


@router.post("/register/start")
async def register_start(payload: RegisterStart):
    """Validate signup details, stash them, and email a 6-digit OTP.

    The account is NOT created here — only after the OTP is verified — so
    abandoned signups never leave real user records behind.
    """
    if await db.users.find_one({"email": payload.email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    otp = generate_otp()
    pending = {
        "email": payload.email,
        "name": payload.name,
        "phone": payload.phone,
        "cafe_name": payload.cafe_name,
        "password_hash": get_password_hash(payload.password),
        "otp_hash": get_password_hash(otp),
        "attempts": 0,
        "expires_at": utcnow() + timedelta(minutes=settings.otp_expiry_minutes),
    }
    # Upsert so re-requesting simply replaces the previous pending record + OTP.
    await db.pending_registrations.replace_one({"email": payload.email}, pending, upsert=True)

    subject, body = otp_email(payload.name, otp)
    await send_email(payload.email, subject, body)

    resp = {"message": "Verification code sent to your email.", "email": payload.email}
    if not settings.email_configured:  # DEV convenience: no mailbox required locally.
        resp["dev_otp"] = otp
    return resp


@router.post("/register/verify", response_model=AuthResponse)
async def register_verify(payload: RegisterVerify):
    """Confirm the OTP and create the cafe + owner account."""
    pending = await db.pending_registrations.find_one({"email": payload.email})
    if not pending:
        raise HTTPException(status_code=400, detail="No pending signup. Please start again.")
    if is_expired(pending["expires_at"]):
        await db.pending_registrations.delete_one({"email": payload.email})
        raise HTTPException(status_code=400, detail="Code expired. Please start again.")
    if pending.get("attempts", 0) >= settings.otp_max_attempts:
        await db.pending_registrations.delete_one({"email": payload.email})
        raise HTTPException(status_code=429, detail="Too many attempts. Please start again.")

    if not verify_password(payload.otp, pending["otp_hash"]):
        await db.pending_registrations.update_one({"email": payload.email}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    # Guard against a race where the email got registered between start and verify.
    if await db.users.find_one({"email": payload.email}):
        await db.pending_registrations.delete_one({"email": payload.email})
        raise HTTPException(status_code=400, detail="Email already registered")

    cafe = Cafe(name=pending["cafe_name"])
    await db.cafes.insert_one(to_mongo(cafe))
    user = User(
        email=pending["email"], name=pending["name"], phone=pending.get("phone"),
        cafe_id=cafe.id, role=Role.owner.value,
    )
    user_doc = to_mongo(user)
    user_doc["password"] = pending["password_hash"]  # already hashed at start
    await db.users.insert_one(user_doc)
    await db.pending_registrations.delete_one({"email": payload.email})

    return _issue(user)


@router.post("/login", response_model=AuthResponse)
async def login(payload: UserLogin):
    user = await db.users.find_one({"email": payload.email})
    if not user or not verify_password(payload.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is deactivated.")
    return _issue(User(**user))


@router.post("/reset/request")
async def reset_request(payload: ResetRequest):
    """Email a tokenized password-reset link. Always returns a generic success
    so the endpoint can't be used to discover which emails are registered."""
    generic = {"message": "If that email is registered, a reset link has been sent."}
    user = await db.users.find_one({"email": payload.email})
    if not user:
        return generic

    token = generate_reset_token()
    await db.password_resets.insert_one({
        "user_id": user["id"],
        "email": user["email"],
        "token_hash": hash_token(token),
        "expires_at": utcnow() + timedelta(minutes=settings.reset_token_expiry_minutes),
    })

    reset_url = f"{settings.frontend_base_url.rstrip('/')}/reset?token={token}"
    subject, body = reset_email(user.get("name", "there"), reset_url)
    await send_email(user["email"], subject, body)

    if not settings.email_configured:  # DEV convenience.
        return {**generic, "dev_reset_url": reset_url}
    return generic


@router.post("/reset/confirm")
async def reset_confirm(payload: ResetConfirm):
    record = await db.password_resets.find_one({"token_hash": hash_token(payload.token)})
    if not record or is_expired(record["expires_at"]):
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    await db.users.update_one(
        {"id": record["user_id"]},
        {"$set": {"password": get_password_hash(payload.password)}},
    )
    # Single-use: drop this token and any other outstanding ones for the user.
    await db.password_resets.delete_many({"user_id": record["user_id"]})
    return {"message": "Password updated. You can now log in."}


@router.post("/refresh")
async def refresh(payload: TokenRefresh):
    """Exchange a valid refresh token for a fresh access + refresh token pair."""
    data = decode_token(payload.refresh_token, expected_type="refresh")
    user = await db.users.find_one({"id": data["user_id"]}, {"_id": 0})
    if not user or not user.get("is_active"):
        raise HTTPException(status_code=401, detail="User not found or deactivated.")
    return {
        "token": create_access_token(data["user_id"], data["cafe_id"], data["role"]),
        "refresh_token": create_refresh_token(data["user_id"], data["cafe_id"], data["role"]),
    }
