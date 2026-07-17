"""
Setup script to initialize sample data for testing the POS system
Run this after registering your first cafe to populate it with sample data
"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


async def setup_sample_data(cafe_id: str):
    """Seed sample categories + inventory for a cafe (menu/tables added manually)."""
    
    print(f"Setting up sample data for cafe: {cafe_id}")
    
    # Create sample categories
    categories = [
        {"id": "cat_beverages", "name": "Beverages", "cafe_id": cafe_id, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "cat_food", "name": "Food", "cafe_id": cafe_id, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "cat_desserts", "name": "Desserts", "cafe_id": cafe_id, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "cat_snacks", "name": "Snacks", "cafe_id": cafe_id, "created_at": "2025-01-01T00:00:00Z"},
    ]
    
    await db.categories.insert_many(categories)
    print(f"✓ Created {len(categories)} categories")

    # NOTE: Menu items, floors, and tables are intentionally NOT seeded here.
    # Configure them manually to exercise the real setup flow — menu via the
    # in-app "Import CSV" button (which also auto-creates categories), and
    # floors/tables through the UI.

    # Create sample inventory items
    inventory = [
        {"id": "inv_1", "name": "Coffee Beans", "cafe_id": cafe_id, "unit": "kg", "current_stock": 50, "min_stock": 10, "max_stock": 100, "cost_per_unit": 800, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "inv_2", "name": "Milk", "cafe_id": cafe_id, "unit": "liters", "current_stock": 30, "min_stock": 20, "max_stock": 80, "cost_per_unit": 60, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "inv_3", "name": "Sugar", "cafe_id": cafe_id, "unit": "kg", "current_stock": 25, "min_stock": 15, "max_stock": 50, "cost_per_unit": 45, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "inv_4", "name": "Bread", "cafe_id": cafe_id, "unit": "packets", "current_stock": 20, "min_stock": 10, "max_stock": 40, "cost_per_unit": 40, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "inv_5", "name": "Cheese", "cafe_id": cafe_id, "unit": "kg", "current_stock": 8, "min_stock": 5, "max_stock": 20, "cost_per_unit": 450, "created_at": "2025-01-01T00:00:00Z"},
    ]
    
    await db.inventory.insert_many(inventory)
    print(f"✓ Created {len(inventory)} inventory items")
    
    print("\n✅ Sample data setup complete!")
    print("\nSeeded: categories + inventory.")
    print("Next, configure the rest yourself to test the real flow:")
    print("  - Menu:   Menu tab → Import CSV (auto-creates categories)")
    print("  - Tables: Tables tab → add floors + tables")


async def main():
    print("="*60)
    print("CAFE POS - Sample Data Setup")
    print("="*60)
    
    # Get all cafes
    cafes = await db.cafes.find({}, {"_id": 0}).to_list(100)
    
    if not cafes:
        print("\n❌ No cafes found!")
        print("Please register a cafe first through the web interface.")
        return
    
    print(f"\nFound {len(cafes)} cafe(s):")
    for i, cafe in enumerate(cafes):
        print(f"  {i+1}. {cafe['name']} (ID: {cafe['id']})")
    
    # If only one cafe, use it automatically
    if len(cafes) == 1:
        selected_cafe = cafes[0]
        print(f"\nUsing cafe: {selected_cafe['name']}")
    else:
        # Let user choose
        choice = input(f"\nEnter cafe number (1-{len(cafes)}): ")
        try:
            idx = int(choice) - 1
            selected_cafe = cafes[idx]
        except (ValueError, IndexError):
            print("❌ Invalid choice!")
            return
    
    # Check if data already exists
    existing = await db.inventory.count_documents({"cafe_id": selected_cafe['id']})
    if existing > 0:
        confirm = input(f"\n⚠️  This cafe already has {existing} inventory items. Continue anyway? (yes/no): ")
        if confirm.lower() != 'yes':
            print("Setup cancelled.")
            return
    
    await setup_sample_data(selected_cafe['id'])
    
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
