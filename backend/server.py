from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, date, timedelta
import hashlib
import json
from passlib.context import CryptContext
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT config — read secret from env, fall back to a dev default
JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production-use-a-long-random-string")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ============================================
# MODELS
# ============================================

# User Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    role: str = "owner"  # superadmin, owner, staff
    cafe_id: str
    pin: Optional[str] = None  # 4-digit PIN for staff/waiters
    is_active: bool = True
    device_token: Optional[str] = None
    last_active: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    cafe_name: str

class UserLogin(BaseModel):
    email: str
    password: str

class WaiterCreate(BaseModel):
    name: str
    pin: str  # 4-digit PIN
    cafe_id: str
    role: str = "staff"  # staff or owner

class WaiterAuth(BaseModel):
    waiter_id: str
    pin: str
    device_id: str  # Unique device identifier

class DeviceSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    waiter_id: str
    device_id: str
    device_name: str
    cafe_id: str
    is_active: bool = True
    authenticated_by: str  # Master user ID who authenticated
    authenticated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_activity: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: Optional[datetime] = None  # Optional session expiry

# Cafe Models
class Cafe(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    gst_number: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Category Models
class Category(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    cafe_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CategoryCreate(BaseModel):
    name: str

# Menu Item Models
class MenuItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    price: float
    category_id: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    available: bool = True
    cafe_id: str
    variants: Optional[List[Dict[str, Any]]] = []
    addons: Optional[List[Dict[str, Any]]] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MenuItemCreate(BaseModel):
    name: str
    price: float
    category_id: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    available: bool = True
    variants: Optional[List[Dict[str, Any]]] = []
    addons: Optional[List[Dict[str, Any]]] = []

# Floor Models
class Floor(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    cafe_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FloorCreate(BaseModel):
    name: str
    cafe_id: str

# Table Models
class Table(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    floor_id: str
    capacity: int
    status: str = "available"  # available, occupied, reserved
    cafe_id: str
    current_order_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TableCreate(BaseModel):
    name: str
    floor_id: str
    capacity: int
    cafe_id: str

# Order Models
class OrderItem(BaseModel):
    menu_item_id: str
    menu_item_name: str
    quantity: int
    price: float
    variants: Optional[List[Dict[str, Any]]] = []
    addons: Optional[List[Dict[str, Any]]] = []
    notes: Optional[str] = None

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    cafe_id: str
    table_id: Optional[str] = None
    items: List[OrderItem]
    subtotal: float
    tax: float = 0
    total: float
    status: str = "active"  # active, completed, cancelled, pending, preparing, ready
    waiter_id: Optional[str] = None
    waiter_name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OrderCreate(BaseModel):
    cafe_id: str
    table_id: Optional[str] = None
    items: List[OrderItem]
    waiter_id: Optional[str] = None
    waiter_name: Optional[str] = None
    status: str = "active"

# Bill Models
class BillItem(BaseModel):
    menu_item_id: str
    menu_item_name: str
    quantity: int
    price: float
    variants: Optional[List[Dict[str, Any]]] = []
    addons: Optional[List[Dict[str, Any]]] = []
    notes: Optional[str] = None

class Bill(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    bill_number: int
    cafe_id: str
    table_id: Optional[str] = None
    items: List[BillItem]
    subtotal: float
    tax: float
    tax_percentage: float = 5.0
    total: float
    payment_method: str = "cash"  # cash, card, upi
    bill_hash: str
    cloud_synced: bool = True
    order_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    soft_deleted: bool = False

class BillCreate(BaseModel):
    cafe_id: str
    table_id: Optional[str] = None
    items: List[BillItem]
    tax_percentage: float = 5.0
    payment_method: str = "cash"
    order_id: Optional[str] = None

# Reservation Models
class Reservation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    cafe_id: str
    table_id: str
    customer_name: str
    customer_phone: str
    guest_count: int
    reservation_date: str
    reservation_time: str
    status: str = "confirmed"  # confirmed, cancelled, completed
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ReservationCreate(BaseModel):
    cafe_id: str
    table_id: str
    customer_name: str
    customer_phone: str
    guest_count: int
    reservation_date: str
    reservation_time: str
    notes: Optional[str] = None

# Day Session Models
class DaySession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    cafe_id: str
    session_date: str
    opening_cash: float
    closing_cash: Optional[float] = None
    expected_cash: Optional[float] = None
    total_sales: float = 0
    total_bills: int = 0
    status: str = "open"  # open, closed
    opened_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    closed_at: Optional[datetime] = None

class DaySessionOpen(BaseModel):
    cafe_id: str
    opening_cash: float

class DaySessionClose(BaseModel):
    session_id: str
    closing_cash: float

# Inventory Models
class InventoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    cafe_id: str
    unit: str
    current_stock: float
    min_stock: float
    max_stock: float
    cost_per_unit: float
    last_restocked: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InventoryItemCreate(BaseModel):
    name: str
    cafe_id: str
    unit: str
    current_stock: float
    min_stock: float
    max_stock: float
    cost_per_unit: float

# ============================================
# UTILITY FUNCTIONS
# ============================================

def calculate_bill_hash(bill_number: int, items: List[BillItem], total: float, timestamp: datetime) -> str:
    """Generate SHA-256 hash for bill immutability"""
    hash_content = f"{bill_number}|{json.dumps([item.model_dump() for item in items], sort_keys=True)}|{total}|{timestamp.isoformat()}"
    return hashlib.sha256(hash_content.encode()).hexdigest()

async def get_next_bill_number(cafe_id: str) -> int:
    """Get the next bill number for a cafe"""
    last_bill = await db.bills.find_one(
        {"cafe_id": cafe_id, "soft_deleted": False},
        sort=[("bill_number", -1)]
    )
    return (last_bill["bill_number"] + 1) if last_bill else 1

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

# ============================================
# JWT UTILITIES
# ============================================

def create_access_token(user_id: str, cafe_id: str, role: str) -> str:
    """Create a signed JWT with user_id, cafe_id, role and 24hr expiry."""
    payload = {
        "user_id": user_id,
        "cafe_id": cafe_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token.")

async def get_current_user(authorization: str = Header(None)) -> dict:
    """FastAPI dependency — decodes JWT and returns the user payload."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required.")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authorization header must be 'Bearer <token>'.")
    payload = decode_access_token(parts[1])
    # Verify user still exists and is active
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user or not user.get("is_active"):
        raise HTTPException(status_code=401, detail="User not found or deactivated.")
    return payload  # returns {"user_id", "cafe_id", "role", "exp", "iat"}

def require_role(allowed_roles: List[str]):
    """
    FastAPI dependency factory for role-based access control.
    Usage: Depends(require_role(["owner", "superadmin"]))
    """
    async def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required roles: {allowed_roles}. Your role: {current_user['role']}"
            )
        return current_user
    return role_checker

# ============================================
# AUTH ROUTES
# ============================================

@api_router.post("/auth/register", response_model=User)
async def register(input: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"email": input.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create cafe first
    cafe = Cafe(name=input.cafe_name)
    cafe_dict = cafe.model_dump()
    cafe_dict['created_at'] = cafe_dict['created_at'].isoformat()
    await db.cafes.insert_one(cafe_dict)
    
    # Create user
    user = User(
        email=input.email,
        name=input.name,
        cafe_id=cafe.id,
        role="owner"
    )
    user_dict = user.model_dump()
    user_dict['password'] = get_password_hash(input.password)
    user_dict['created_at'] = user_dict['created_at'].isoformat()
    
    await db.users.insert_one(user_dict)
    return user

@api_router.post("/auth/login")
async def login(input: UserLogin):
    user = await db.users.find_one({"email": input.email})
    if not user or not verify_password(input.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is deactivated.")

    # Convert datetime strings back to datetime objects
    if isinstance(user.get('created_at'), str):
        user['created_at'] = datetime.fromisoformat(user['created_at'])
    
    user_obj = User(**user)
    token = create_access_token(
        user_id=user_obj.id,
        cafe_id=user_obj.cafe_id,
        role=user_obj.role
    )
    return {"user": user_obj, "token": token}

# ============================================
# WAITER MANAGEMENT ROUTES
# ============================================

@api_router.post("/waiters", response_model=User)
async def create_waiter(input: WaiterCreate, current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Create a new staff account (only owners/superadmins can do this)"""
    
    # Check if waiter with same name exists in this cafe
    existing_waiter = await db.users.find_one({
        "name": input.name, 
        "cafe_id": input.cafe_id,
        "role": "staff"
    })
    if existing_waiter:
        raise HTTPException(status_code=400, detail="Staff member with this name already exists")
    
    # Validate PIN (4 digits)
    if not input.pin.isdigit() or len(input.pin) != 4:
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")
    
    # Create staff member
    waiter = User(
        email=f"staff_{input.name.lower().replace(' ', '_')}@{input.cafe_id}",
        name=input.name,
        role=input.role,
        cafe_id=input.cafe_id,
        pin=get_password_hash(input.pin),
        is_active=True,
        created_by=current_user.get("user_id")
    )
    
    waiter_dict = waiter.model_dump()
    waiter_dict['created_at'] = waiter_dict['created_at'].isoformat()
    
    await db.users.insert_one(waiter_dict)
    return waiter

@api_router.get("/waiters", response_model=List[User])
async def get_waiters(cafe_id: str, current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Get all staff for a cafe"""
    waiters = await db.users.find({
        "cafe_id": cafe_id,
        "role": {"$in": ["staff", "waiter"]}  # support legacy "waiter" role
    }, {"_id": 0, "pin": 0}).to_list(1000)
    
    for waiter in waiters:
        if isinstance(waiter.get('created_at'), str):
            waiter['created_at'] = datetime.fromisoformat(waiter['created_at'])
    
    return waiters

@api_router.post("/waiters/authenticate")
async def authenticate_waiter_device(input: WaiterAuth, current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Master authenticates a staff member on their device (one-time setup)"""
    
    # Find waiter/staff
    waiter = await db.users.find_one({"id": input.waiter_id, "role": {"$in": ["staff", "waiter"]}})
    if not waiter:
        raise HTTPException(status_code=404, detail="Waiter not found")
    
    # Verify PIN
    if not verify_password(input.pin, waiter.get("pin", "")):
        raise HTTPException(status_code=401, detail="Invalid PIN")
    
    # Check if device is already authenticated
    existing_session = await db.device_sessions.find_one({
        "device_id": input.device_id,
        "is_active": True
    })
    
    if existing_session:
        # Update existing session
        await db.device_sessions.update_one(
            {"id": existing_session["id"]},
            {
                "$set": {
                    "waiter_id": input.waiter_id,
                    "authenticated_by": current_user.get("user_id"),
                    "authenticated_at": datetime.now(timezone.utc).isoformat(),
                    "last_activity": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        session_id = existing_session["id"]
    else:
        # Create new device session
        session = DeviceSession(
            waiter_id=input.waiter_id,
            device_id=input.device_id,
            device_name=f"Staff Device - {waiter['name']}",
            cafe_id=waiter["cafe_id"],
            authenticated_by=current_user.get("user_id")
        )
        
        session_dict = session.model_dump()
        session_dict['authenticated_at'] = session_dict['authenticated_at'].isoformat()
        session_dict['last_activity'] = session_dict['last_activity'].isoformat()
        
        await db.device_sessions.insert_one(session_dict)
        session_id = session.id
    
    # Update waiter's last active time
    await db.users.update_one(
        {"id": input.waiter_id},
        {"$set": {"last_active": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "success": True,
        "session_id": session_id,
        "waiter": {
            "id": waiter["id"],
            "name": waiter["name"],
            "cafe_id": waiter["cafe_id"]
        },
        "message": f"Device authenticated for {waiter['name']}"
    }

@api_router.post("/waiters/login")
async def waiter_device_login(device_id: str):
    """Waiter logs in using their authenticated device"""
    # Find active device session
    session = await db.device_sessions.find_one({
        "device_id": device_id,
        "is_active": True
    })
    
    if not session:
        raise HTTPException(
            status_code=401, 
            detail="Device not authenticated. Please ask your manager to authenticate this device."
        )
    
    # Get waiter details
    waiter = await db.users.find_one({"id": session["waiter_id"]})
    if not waiter or not waiter.get("is_active"):
        raise HTTPException(status_code=401, detail="Waiter account is inactive")
    
    # Update last activity
    await db.device_sessions.update_one(
        {"id": session["id"]},
        {"$set": {"last_activity": datetime.now(timezone.utc).isoformat()}}
    )
    
    await db.users.update_one(
        {"id": waiter["id"]},
        {"$set": {"last_active": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Convert datetime strings back to datetime objects
    if isinstance(waiter.get('created_at'), str):
        waiter['created_at'] = datetime.fromisoformat(waiter['created_at'])
    
    waiter_obj = User(**waiter)
    return {
        "user": waiter_obj,
        "session_id": session["id"],
        "device_id": device_id
    }

@api_router.delete("/waiters/{waiter_id}")
async def deactivate_waiter(waiter_id: str, current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Deactivate a staff account"""
    
    # Deactivate waiter
    await db.users.update_one(
        {"id": waiter_id, "role": "waiter"},
        {"$set": {"is_active": False}}
    )
    
    # Deactivate all device sessions for this waiter
    await db.device_sessions.update_many(
        {"waiter_id": waiter_id},
        {"$set": {"is_active": False}}
    )
    
    return {"message": "Waiter deactivated successfully"}

@api_router.get("/device-sessions", response_model=List[DeviceSession])
async def get_device_sessions(cafe_id: str, current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Get all active device sessions for a cafe"""
    
    sessions = await db.device_sessions.find({
        "cafe_id": cafe_id,
        "is_active": True
    }, {"_id": 0}).to_list(1000)
    
    for session in sessions:
        if isinstance(session.get('authenticated_at'), str):
            session['authenticated_at'] = datetime.fromisoformat(session['authenticated_at'])
        if isinstance(session.get('last_activity'), str):
            session['last_activity'] = datetime.fromisoformat(session['last_activity'])
    
    return sessions

# ============================================
# MENU ROUTES
# ============================================

@api_router.get("/menu/categories", response_model=List[Category])
async def get_categories(current_user: dict = Depends(get_current_user)):
    """List categories scoped to the caller's cafe_id from JWT."""
    cafe_id = current_user["cafe_id"]
    categories = await db.categories.find({"cafe_id": cafe_id}, {"_id": 0}).to_list(1000)
    for cat in categories:
        if isinstance(cat.get('created_at'), str):
            cat['created_at'] = datetime.fromisoformat(cat['created_at'])
    return categories

@api_router.post("/menu/categories", response_model=Category)
async def create_category(input: CategoryCreate, current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Create a category — cafe_id is always taken from JWT, never from the request body."""
    category = Category(name=input.name, cafe_id=current_user["cafe_id"])
    cat_dict = category.model_dump()
    cat_dict['created_at'] = cat_dict['created_at'].isoformat()
    await db.categories.insert_one(cat_dict)
    return category

@api_router.put("/menu/categories/{category_id}", response_model=Category)
async def update_category(category_id: str, input: CategoryCreate, current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Update a category — verifies it belongs to the caller's cafe before updating."""
    existing = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this category.")
    await db.categories.update_one(
        {"id": category_id},
        {"$set": {"name": input.name}}
    )
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return Category(**updated)

@api_router.delete("/menu/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Delete a category — verifies it belongs to the caller's cafe before deleting."""
    existing = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this category.")
    await db.categories.delete_one({"id": category_id})
    return {"message": "Category deleted successfully."}

@api_router.get("/menu/items", response_model=List[MenuItem])
async def get_menu_items(current_user: dict = Depends(get_current_user)):
    """List menu items scoped to the caller's cafe_id from JWT."""
    cafe_id = current_user["cafe_id"]
    items = await db.menu_items.find({"cafe_id": cafe_id}, {"_id": 0}).to_list(1000)
    for item in items:
        if isinstance(item.get('created_at'), str):
            item['created_at'] = datetime.fromisoformat(item['created_at'])
    return items

@api_router.post("/menu/items", response_model=MenuItem)
async def create_menu_item(input: MenuItemCreate, current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Create a menu item — cafe_id is always taken from JWT."""
    # Verify the category belongs to this cafe
    category = await db.categories.find_one({"id": input.category_id, "cafe_id": current_user["cafe_id"]})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found in your cafe.")
    item_data = input.model_dump()
    item_data["cafe_id"] = current_user["cafe_id"]  # always override with JWT cafe_id
    item = MenuItem(**item_data)
    item_dict = item.model_dump()
    item_dict['created_at'] = item_dict['created_at'].isoformat()
    await db.menu_items.insert_one(item_dict)
    return item

@api_router.put("/menu/items/{item_id}", response_model=MenuItem)
async def update_menu_item(item_id: str, input: MenuItemCreate, current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Update a menu item — verifies it belongs to the caller's cafe."""
    existing = await db.menu_items.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this menu item.")
    item_dict = input.model_dump()
    item_dict["cafe_id"] = current_user["cafe_id"]  # prevent cafe_id tampering
    await db.menu_items.update_one({"id": item_id}, {"$set": item_dict})
    updated_item = await db.menu_items.find_one({"id": item_id}, {"_id": 0})
    if isinstance(updated_item.get('created_at'), str):
        updated_item['created_at'] = datetime.fromisoformat(updated_item['created_at'])
    return MenuItem(**updated_item)

@api_router.delete("/menu/items/{item_id}")
async def delete_menu_item(item_id: str, current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Delete a menu item — verifies it belongs to the caller's cafe."""
    existing = await db.menu_items.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this menu item.")
    await db.menu_items.delete_one({"id": item_id})
    return {"message": "Item deleted successfully."}

# ============================================
# TABLE & FLOOR ROUTES
# ============================================

@api_router.get("/floors", response_model=List[Floor])
async def get_floors(current_user: dict = Depends(get_current_user)):
    """Get all floors for the user's cafe (scoped by JWT)."""
    cafe_id = current_user["cafe_id"]
    floors = await db.floors.find({"cafe_id": cafe_id}, {"_id": 0}).to_list(1000)
    for floor in floors:
        if isinstance(floor.get('created_at'), str):
            floor['created_at'] = datetime.fromisoformat(floor['created_at'])
    return floors

@api_router.post("/floors", response_model=Floor)
async def create_floor(input: FloorCreate, current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Create a floor — cafe_id is always taken from JWT."""
    floor = Floor(name=input.name, cafe_id=current_user["cafe_id"])
    floor_dict = floor.model_dump()
    floor_dict['created_at'] = floor_dict['created_at'].isoformat()
    await db.floors.insert_one(floor_dict)
    return floor

@api_router.get("/tables", response_model=List[Table])
async def get_tables(current_user: dict = Depends(get_current_user)):
    """Get all tables for the user's cafe (scoped by JWT)."""
    cafe_id = current_user["cafe_id"]
    tables = await db.tables.find({"cafe_id": cafe_id}, {"_id": 0}).to_list(1000)
    for table in tables:
        if isinstance(table.get('created_at'), str):
            table['created_at'] = datetime.fromisoformat(table['created_at'])
    return tables

@api_router.post("/tables", response_model=Table)
async def create_table(input: TableCreate, current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Create a table — cafe_id is always taken from JWT."""
    table = Table(name=input.name, floor_id=input.floor_id, capacity=input.capacity, cafe_id=current_user["cafe_id"])
    table_dict = table.model_dump()
    table_dict['created_at'] = table_dict['created_at'].isoformat()
    await db.tables.insert_one(table_dict)
    return table

@api_router.put("/tables/{table_id}", response_model=Table)
async def update_table(table_id: str, updates: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    """Update a table — verifies it belongs to the user's cafe."""
    existing = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Table not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this table.")
    # Prevent cafe_id tampering
    updates_copy = dict(updates)
    updates_copy.pop("cafe_id", None)
    await db.tables.update_one({"id": table_id}, {"$set": updates_copy})
    updated_table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if isinstance(updated_table.get('created_at'), str):
        updated_table['created_at'] = datetime.fromisoformat(updated_table['created_at'])
    return Table(**updated_table)

# ============================================
# ORDER ROUTES
# ============================================

@api_router.get("/orders", response_model=List[Order])
async def get_orders(status: str = "active", current_user: dict = Depends(get_current_user)):
    """Get orders for the user's cafe (scoped by JWT)."""
    cafe_id = current_user["cafe_id"]
    orders = await db.orders.find({"cafe_id": cafe_id, "status": status}, {"_id": 0}).to_list(1000)
    for order in orders:
        if isinstance(order.get('created_at'), str):
            order['created_at'] = datetime.fromisoformat(order['created_at'])
        if isinstance(order.get('updated_at'), str):
            order['updated_at'] = datetime.fromisoformat(order['updated_at'])
    return orders

@api_router.post("/orders", response_model=Order)
async def create_order(input: OrderCreate, current_user: dict = Depends(get_current_user)):
    """Create an order — cafe_id is always taken from JWT."""
    # Calculate totals
    subtotal = sum(item.price * item.quantity for item in input.items)
    tax = subtotal * 0.05  # 5% GST
    total = subtotal + tax
    
    order = Order(
        cafe_id=current_user["cafe_id"],  # Always use JWT cafe_id
        table_id=input.table_id,
        items=input.items,
        subtotal=subtotal,
        tax=tax,
        total=total,
        status=input.status,
        waiter_id=input.waiter_id,
        waiter_name=input.waiter_name
    )
    
    order_dict = order.model_dump()
    order_dict['created_at'] = order_dict['created_at'].isoformat()
    order_dict['updated_at'] = order_dict['updated_at'].isoformat()
    
    await db.orders.insert_one(order_dict)
    
    # Update table status if table_id provided
    if input.table_id:
        await db.tables.update_one(
            {"id": input.table_id},
            {"$set": {"status": "occupied", "current_order_id": order.id}}
        )
    
    return order

@api_router.put("/orders/{order_id}", response_model=Order)
async def update_order(order_id: str, input: OrderCreate, current_user: dict = Depends(get_current_user)):
    """Update an order — verifies it belongs to the user's cafe."""
    existing = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this order.")
    
    subtotal = sum(item.price * item.quantity for item in input.items)
    tax = subtotal * 0.05
    total = subtotal + tax
    
    update_dict = {
        "items": [item.model_dump() for item in input.items],
        "subtotal": subtotal,
        "tax": tax,
        "total": total,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_dict})
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if isinstance(updated_order.get('created_at'), str):
        updated_order['created_at'] = datetime.fromisoformat(updated_order['created_at'])
    if isinstance(updated_order.get('updated_at'), str):
        updated_order['updated_at'] = datetime.fromisoformat(updated_order['updated_at'])
    return Order(**updated_order)

@api_router.delete("/orders/{order_id}")
async def cancel_order(order_id: str, current_user: dict = Depends(get_current_user)):
    """Cancel an order — verifies it belongs to the user's cafe."""
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    if order["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this order.")
    
    if order.get("table_id"):
        await db.tables.update_one(
            {"id": order["table_id"]},
            {"$set": {"status": "available", "current_order_id": None}}
        )
    
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "cancelled"}})
    return {"message": "Order cancelled successfully"}

# ============================================
# BILL ROUTES (WITH HASHING & IMMUTABILITY)
# ============================================

@api_router.post("/bills", response_model=Bill)
async def create_bill(input: BillCreate, current_user: dict = Depends(get_current_user)):
    """Create a bill — cafe_id is always taken from JWT."""
    # Calculate totals
    subtotal = sum(item.price * item.quantity for item in input.items)
    tax = subtotal * (input.tax_percentage / 100)
    total = subtotal + tax
    
    # Get next bill number
    bill_number = await get_next_bill_number(current_user["cafe_id"])
    
    # Create timestamp
    timestamp = datetime.now(timezone.utc)
    
    # Calculate hash
    bill_hash = calculate_bill_hash(bill_number, input.items, total, timestamp)
    
    bill = Bill(
        bill_number=bill_number,
        cafe_id=current_user["cafe_id"],  # Always use JWT cafe_id
        table_id=input.table_id,
        items=input.items,
        subtotal=subtotal,
        tax=tax,
        tax_percentage=input.tax_percentage,
        total=total,
        payment_method=input.payment_method,
        bill_hash=bill_hash,
        cloud_synced=True,
        order_id=input.order_id,
        created_at=timestamp
    )
    
    bill_dict = bill.model_dump()
    bill_dict['created_at'] = bill_dict['created_at'].isoformat()
    
    await db.bills.insert_one(bill_dict)
    
    # If this bill is from an order, mark order as completed
    if input.order_id:
        await db.orders.update_one(
            {"id": input.order_id},
            {"$set": {"status": "completed"}}
        )
    
    # Free up table if table_id provided
    if input.table_id:
        await db.tables.update_one(
            {"id": input.table_id},
            {"$set": {"status": "available", "current_order_id": None}}
        )
    
    # Update day session
    today = date.today().isoformat()
    session = await db.day_sessions.find_one({"cafe_id": current_user["cafe_id"], "session_date": today, "status": "open"})
    if session:
        await db.day_sessions.update_one(
            {"id": session["id"]},
            {
                "$inc": {"total_sales": total, "total_bills": 1},
                "$set": {"expected_cash": session.get("opening_cash", 0) + session.get("total_sales", 0) + total}
            }
        )
    
    return bill

@api_router.get("/bills", response_model=List[Bill])
async def get_bills(limit: int = 100, date_filter: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get bills for the user's cafe (scoped by JWT)."""
    cafe_id = current_user["cafe_id"]
    query = {"cafe_id": cafe_id, "soft_deleted": False}
    
    if date_filter:
        # Filter by date
        start_date = datetime.fromisoformat(date_filter).replace(hour=0, minute=0, second=0)
        end_date = start_date.replace(hour=23, minute=59, second=59)
        query["created_at"] = {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
    
    bills = await db.bills.find(query, {"_id": 0}).sort("bill_number", -1).to_list(limit)
    
    for bill in bills:
        if isinstance(bill.get('created_at'), str):
            bill['created_at'] = datetime.fromisoformat(bill['created_at'])
    
    return bills

@api_router.get("/bills/{bill_id}", response_model=Bill)
async def get_bill(bill_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific bill — verifies it belongs to the user's cafe."""
    bill = await db.bills.find_one({"id": bill_id, "soft_deleted": False}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this bill.")
    
    if isinstance(bill.get('created_at'), str):
        bill['created_at'] = datetime.fromisoformat(bill['created_at'])
    
    return Bill(**bill)

# ============================================
# RESERVATION ROUTES
# ============================================

@api_router.get("/reservations", response_model=List[Reservation])
async def get_reservations(date_filter: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get reservations for the user's cafe (scoped by JWT)."""
    cafe_id = current_user["cafe_id"]
    query = {"cafe_id": cafe_id}
    if date_filter:
        query["reservation_date"] = date_filter
    
    reservations = await db.reservations.find(query, {"_id": 0}).to_list(1000)
    for res in reservations:
        if isinstance(res.get('created_at'), str):
            res['created_at'] = datetime.fromisoformat(res['created_at'])
    return reservations

@api_router.post("/reservations", response_model=Reservation)
async def create_reservation(input: ReservationCreate, current_user: dict = Depends(get_current_user)):
    """Create a reservation — cafe_id is always taken from JWT."""
    reservation = Reservation(
        cafe_id=current_user["cafe_id"],  # Always use JWT cafe_id
        table_id=input.table_id,
        customer_name=input.customer_name,
        customer_phone=input.customer_phone,
        guest_count=input.guest_count,
        reservation_date=input.reservation_date,
        reservation_time=input.reservation_time,
        notes=input.notes
    )
    res_dict = reservation.model_dump()
    res_dict['created_at'] = res_dict['created_at'].isoformat()
    await db.reservations.insert_one(res_dict)
    
    # Update table status to reserved
    await db.tables.update_one(
        {"id": input.table_id},
        {"$set": {"status": "reserved"}}
    )
    
    return reservation

@api_router.put("/reservations/{reservation_id}", response_model=Reservation)
async def update_reservation(reservation_id: str, updates: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    """Update a reservation — verifies it belongs to the user's cafe."""
    existing = await db.reservations.find_one({"id": reservation_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reservation not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this reservation.")
    # Prevent cafe_id tampering
    updates_copy = dict(updates)
    updates_copy.pop("cafe_id", None)
    await db.reservations.update_one({"id": reservation_id}, {"$set": updates_copy})
    updated_res = await db.reservations.find_one({"id": reservation_id}, {"_id": 0})
    if isinstance(updated_res.get('created_at'), str):
        updated_res['created_at'] = datetime.fromisoformat(updated_res['created_at'])
    return Reservation(**updated_res)

@api_router.delete("/reservations/{reservation_id}")
async def cancel_reservation(reservation_id: str, current_user: dict = Depends(get_current_user)):
    """Cancel a reservation — verifies it belongs to the user's cafe."""
    reservation = await db.reservations.find_one({"id": reservation_id})
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found.")
    if reservation["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this reservation.")
    
    if reservation:
        await db.tables.update_one(
            {"id": reservation["table_id"]},
            {"$set": {"status": "available"}}
        )
    
    await db.reservations.update_one(
        {"id": reservation_id},
        {"$set": {"status": "cancelled"}}
    )
    return {"message": "Reservation cancelled successfully"}

# ============================================
# DAY SESSION ROUTES
# ============================================

@api_router.get("/sessions/current")
async def get_current_session(current_user: dict = Depends(get_current_user)):
    """Get current day session for the user's cafe."""
    cafe_id = current_user["cafe_id"]
    today = date.today().isoformat()
    session = await db.day_sessions.find_one(
        {"cafe_id": cafe_id, "session_date": today, "status": "open"},
        {"_id": 0}
    )
    
    if session:
        if isinstance(session.get('opened_at'), str):
            session['opened_at'] = datetime.fromisoformat(session['opened_at'])
        if session.get('closed_at') and isinstance(session.get('closed_at'), str):
            session['closed_at'] = datetime.fromisoformat(session['closed_at'])
        return DaySession(**session)
    
    return None

@api_router.post("/sessions/open", response_model=DaySession)
async def open_day_session(input: DaySessionOpen, current_user: dict = Depends(get_current_user)):
    """Open a day session — cafe_id is always taken from JWT."""
    cafe_id = current_user["cafe_id"]
    today = date.today().isoformat()
    
    # Check if session already open
    existing = await db.day_sessions.find_one(
        {"cafe_id": cafe_id, "session_date": today, "status": "open"}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Session already open for today")
    
    session = DaySession(
        cafe_id=cafe_id,
        session_date=today,
        opening_cash=input.opening_cash,
        expected_cash=input.opening_cash
    )
    
    session_dict = session.model_dump()
    session_dict['opened_at'] = session_dict['opened_at'].isoformat()
    
    await db.day_sessions.insert_one(session_dict)
    return session

@api_router.post("/sessions/close", response_model=DaySession)
async def close_day_session(input: DaySessionClose, current_user: dict = Depends(get_current_user)):
    """Close a day session — verifies it belongs to the user's cafe."""
    session = await db.day_sessions.find_one({"id": input.session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this session.")

    if session["status"] == "closed":
        raise HTTPException(status_code=400, detail="Session already closed")
    
    update_dict = {
        "closing_cash": input.closing_cash,
        "closed_at": datetime.now(timezone.utc).isoformat(),
        "status": "closed"
    }
    
    await db.day_sessions.update_one({"id": input.session_id}, {"$set": update_dict})
    
    updated_session = await db.day_sessions.find_one({"id": input.session_id}, {"_id": 0})
    if isinstance(updated_session.get('opened_at'), str):
        updated_session['opened_at'] = datetime.fromisoformat(updated_session['opened_at'])
    if isinstance(updated_session.get('closed_at'), str):
        updated_session['closed_at'] = datetime.fromisoformat(updated_session['closed_at'])
    
    return DaySession(**updated_session)

@api_router.get("/sessions/history", response_model=List[DaySession])
async def get_session_history(current_user: dict = Depends(get_current_user)):
    """Get session history for the user's cafe."""
    cafe_id = current_user["cafe_id"]
    sessions = await db.day_sessions.find(
        {"cafe_id": cafe_id},
        {"_id": 0}
    ).sort("session_date", -1).to_list(30)
    
    for session in sessions:
        if isinstance(session.get('opened_at'), str):
            session['opened_at'] = datetime.fromisoformat(session['opened_at'])
        if session.get('closed_at') and isinstance(session.get('closed_at'), str):
            session['closed_at'] = datetime.fromisoformat(session['closed_at'])
    
    return sessions

# ============================================
# REPORTS ROUTES
# ============================================

@api_router.get("/reports/daily")
async def get_daily_report(report_date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get daily report for the user's cafe."""
    cafe_id = current_user["cafe_id"]
    if not report_date:
        report_date = date.today().isoformat()
    
    # Get session
    session = await db.day_sessions.find_one(
        {"cafe_id": cafe_id, "session_date": report_date},
        {"_id": 0}
    )
    
    # Get bills for the day
    start_date = datetime.fromisoformat(report_date).replace(hour=0, minute=0, second=0)
    end_date = start_date.replace(hour=23, minute=59, second=59)
    
    bills = await db.bills.find({
        "cafe_id": cafe_id,
        "soft_deleted": False,
        "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
    }, {"_id": 0}).to_list(1000)
    
    # Calculate payment breakdown
    payment_breakdown = {"cash": 0, "card": 0, "upi": 0}
    for bill in bills:
        payment_breakdown[bill["payment_method"]] += bill["total"]
    
    # Item popularity
    item_counts = {}
    for bill in bills:
        for item in bill["items"]:
            if item["menu_item_name"] not in item_counts:
                item_counts[item["menu_item_name"]] = 0
            item_counts[item["menu_item_name"]] += item["quantity"]
    
    return {
        "date": report_date,
        "session": session,
        "total_bills": len(bills),
        "total_sales": sum(bill["total"] for bill in bills),
        "payment_breakdown": payment_breakdown,
        "popular_items": sorted(item_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    }

# ============================================
# INVENTORY ROUTES
# ============================================

@api_router.get("/inventory", response_model=List[InventoryItem])
async def get_inventory(current_user: dict = Depends(get_current_user)):
    """Get inventory for the user's cafe."""
    cafe_id = current_user["cafe_id"]
    items = await db.inventory.find({"cafe_id": cafe_id}, {"_id": 0}).to_list(1000)
    for item in items:
        if isinstance(item.get('created_at'), str):
            item['created_at'] = datetime.fromisoformat(item['created_at'])
        if item.get('last_restocked') and isinstance(item.get('last_restocked'), str):
            item['last_restocked'] = datetime.fromisoformat(item['last_restocked'])
    return items

@api_router.post("/inventory", response_model=InventoryItem)
async def create_inventory_item(input: InventoryItemCreate, current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Create an inventory item — cafe_id is always taken from JWT."""
    item = InventoryItem(
        name=input.name,
        cafe_id=current_user["cafe_id"],
        unit=input.unit,
        current_stock=input.current_stock,
        min_stock=input.min_stock,
        max_stock=input.max_stock,
        cost_per_unit=input.cost_per_unit
    )
    item_dict = item.model_dump()
    item_dict['created_at'] = item_dict['created_at'].isoformat()
    if item_dict.get('last_restocked'):
        item_dict['last_restocked'] = item_dict['last_restocked'].isoformat()
    await db.inventory.insert_one(item_dict)
    return item

@api_router.put("/inventory/{item_id}", response_model=InventoryItem)
async def update_inventory_item(item_id: str, updates: Dict[str, Any], current_user: dict = Depends(require_role(["owner", "superadmin"]))):
    """Update an inventory item — verifies it belongs to the user's cafe."""
    existing = await db.inventory.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Inventory item not found.")
    if existing["cafe_id"] != current_user["cafe_id"]:
        raise HTTPException(status_code=403, detail="You do not have access to this inventory item.")
    
    updates_copy = dict(updates)
    updates_copy.pop("cafe_id", None)
    
    if "last_restocked" in updates_copy and isinstance(updates_copy["last_restocked"], datetime):
        updates_copy["last_restocked"] = updates_copy["last_restocked"].isoformat()
    
    await db.inventory.update_one({"id": item_id}, {"$set": updates_copy})
    updated_item = await db.inventory.find_one({"id": item_id}, {"_id": 0})
    
    if isinstance(updated_item.get('created_at'), str):
        updated_item['created_at'] = datetime.fromisoformat(updated_item['created_at'])
    if updated_item.get('last_restocked') and isinstance(updated_item.get('last_restocked'), str):
        updated_item['last_restocked'] = datetime.fromisoformat(updated_item['last_restocked'])
    
    return InventoryItem(**updated_item)

# ============================================
# PRINTER ROUTES (MOCKED)
# ============================================

@api_router.post("/printer/bill")
async def print_bill(bill_id: str):
    """Mock printer endpoint - logs bill details"""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    
    print("\n" + "="*50)
    print("BILL PRINT (MOCKED)")
    print("="*50)
    print(f"Bill #: {bill['bill_number']}")
    print(f"Date: {bill['created_at']}")
    print("-"*50)
    for item in bill['items']:
        print(f"{item['menu_item_name']} x{item['quantity']} - ₹{item['price'] * item['quantity']}")
    print("-"*50)
    print(f"Subtotal: ₹{bill['subtotal']}")
    print(f"Tax ({bill['tax_percentage']}%): ₹{bill['tax']}")
    print(f"Total: ₹{bill['total']}")
    print(f"Payment: {bill['payment_method'].upper()}")
    print(f"Hash: {bill['bill_hash'][:16]}...")
    print("="*50 + "\n")
    
    return {"message": "Bill printed successfully (mocked)", "bill_number": bill['bill_number']}

@api_router.post("/printer/kot")
async def print_kot(order_id: str):
    """Mock KOT (Kitchen Order Ticket) printer endpoint"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    print("\n" + "="*50)
    print("KOT (Kitchen Order Ticket) - MOCKED")
    print("="*50)
    print(f"Order ID: {order['id'][:8]}")
    print(f"Table: {order.get('table_id', 'N/A')}")
    print(f"Time: {order['created_at']}")
    print("-"*50)
    for item in order['items']:
        print(f"{item['menu_item_name']} x{item['quantity']}")
        if item.get('notes'):
            print(f"  Note: {item['notes']}")
    print("="*50 + "\n")
    
    return {"message": "KOT printed successfully (mocked)", "order_id": order['id']}

# ============================================
# BASIC ROUTES
# ============================================

@api_router.get("/")
async def root():
    return {"message": "Cafe POS API v1.0", "status": "running"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "database": "connected"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
