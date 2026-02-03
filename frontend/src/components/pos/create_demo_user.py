#!/usr/bin/env python3
import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
import uuid
from datetime import datetime

# Add the backend path to sys.path
sys.path.append('/Users/kshitijpatil/Desktop/pos/backend')

# MongoDB connection
mongo_url = "mongodb://localhost:27017"
client = AsyncIOMotorClient(mongo_url)
db = client["test_database"]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_demo_user():
    """Create a demo user and cafe"""
    
    # Demo user credentials
    demo_email = "admin@demo.com"
    demo_password = "demo123"
    demo_name = "Demo Admin"
    
    # Check if user already exists
    existing_user = await db.users.find_one({"email": demo_email})
    if existing_user:
        print(f"✅ Demo user already exists!")
        print(f"📧 Email: {demo_email}")
        print(f"🔑 Password: {demo_password}")
        return
    
    # Create demo cafe
    cafe_id = str(uuid.uuid4())
    cafe_data = {
        "id": cafe_id,
        "name": "Demo Cafe",
        "address": "123 Demo Street",
        "phone": "+1234567890",
        "email": "demo@cafe.com",
        "created_at": datetime.utcnow().isoformat() + "Z"
    }
    
    # Create demo user
    hashed_password = pwd_context.hash(demo_password)
    user_data = {
        "id": str(uuid.uuid4()),
        "name": demo_name,
        "email": demo_email,
        "password": hashed_password,
        "role": "manager",
        "cafe_id": cafe_id,
        "created_at": datetime.utcnow().isoformat() + "Z"
    }
    
    try:
        # Insert cafe
        await db.cafes.insert_one(cafe_data)
        print(f"✅ Created demo cafe: {cafe_data['name']}")
        
        # Insert user
        await db.users.insert_one(user_data)
        print(f"✅ Created demo user successfully!")
        print(f"\n🎯 LOGIN CREDENTIALS:")
        print(f"📧 Email: {demo_email}")
        print(f"🔑 Password: {demo_password}")
        print(f"👤 Role: Manager")
        print(f"🏪 Cafe: {cafe_data['name']}")
        
    except Exception as e:
        print(f"❌ Error creating demo user: {e}")

if __name__ == "__main__":
    asyncio.run(create_demo_user())