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
    """Setup sample menu, tables, and floors for a cafe"""
    
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
    
    # Create sample menu items
    menu_items = [
        # Beverages
        {"id": "item_1", "name": "Espresso", "price": 80, "category_id": "cat_beverages", "description": "Strong Italian coffee", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        {"id": "item_2", "name": "Cappuccino", "price": 120, "category_id": "cat_beverages", "description": "Espresso with steamed milk", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        {"id": "item_3", "name": "Latte", "price": 130, "category_id": "cat_beverages", "description": "Espresso with more milk", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        {"id": "item_4", "name": "Cold Coffee", "price": 150, "category_id": "cat_beverages", "description": "Chilled coffee drink", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        {"id": "item_5", "name": "Green Tea", "price": 60, "category_id": "cat_beverages", "description": "Healthy herbal tea", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        {"id": "item_6", "name": "Masala Chai", "price": 40, "category_id": "cat_beverages", "description": "Indian spiced tea", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        
        # Food
        {"id": "item_7", "name": "Veg Sandwich", "price": 100, "category_id": "cat_food", "description": "Fresh vegetable sandwich", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        {"id": "item_8", "name": "Cheese Sandwich", "price": 120, "category_id": "cat_food", "description": "Grilled cheese sandwich", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        {"id": "item_9", "name": "Veg Burger", "price": 150, "category_id": "cat_food", "description": "Vegetarian burger", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        {"id": "item_10", "name": "Pasta", "price": 180, "category_id": "cat_food", "description": "Italian pasta", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        {"id": "item_11", "name": "Pizza", "price": 250, "category_id": "cat_food", "description": "Cheese pizza", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        
        # Desserts
        {"id": "item_12", "name": "Brownie", "price": 80, "category_id": "cat_desserts", "description": "Chocolate brownie", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        {"id": "item_13", "name": "Ice Cream", "price": 60, "category_id": "cat_desserts", "description": "Vanilla ice cream", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        {"id": "item_14", "name": "Pastry", "price": 100, "category_id": "cat_desserts", "description": "Fresh pastry", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        
        # Snacks
        {"id": "item_15", "name": "French Fries", "price": 80, "category_id": "cat_snacks", "description": "Crispy fries", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
        {"id": "item_16", "name": "Samosa", "price": 30, "category_id": "cat_snacks", "description": "Indian snack", "available": True, "cafe_id": cafe_id, "variants": [], "addons": [], "created_at": "2025-01-01T00:00:00Z"},
    ]
    
    await db.menu_items.insert_many(menu_items)
    print(f"✓ Created {len(menu_items)} menu items")
    
    # Create sample floors
    floors = [
        {"id": "floor_1", "name": "Ground Floor", "cafe_id": cafe_id, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "floor_2", "name": "First Floor", "cafe_id": cafe_id, "created_at": "2025-01-01T00:00:00Z"},
    ]
    
    await db.floors.insert_many(floors)
    print(f"✓ Created {len(floors)} floors")
    
    # Create sample tables
    tables = [
        # Ground Floor
        {"id": "table_1", "name": "T1", "floor_id": "floor_1", "capacity": 2, "status": "available", "cafe_id": cafe_id, "current_order_id": None, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "table_2", "name": "T2", "floor_id": "floor_1", "capacity": 4, "status": "available", "cafe_id": cafe_id, "current_order_id": None, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "table_3", "name": "T3", "floor_id": "floor_1", "capacity": 4, "status": "available", "cafe_id": cafe_id, "current_order_id": None, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "table_4", "name": "T4", "floor_id": "floor_1", "capacity": 2, "status": "available", "cafe_id": cafe_id, "current_order_id": None, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "table_5", "name": "T5", "floor_id": "floor_1", "capacity": 6, "status": "available", "cafe_id": cafe_id, "current_order_id": None, "created_at": "2025-01-01T00:00:00Z"},
        
        # First Floor
        {"id": "table_6", "name": "T6", "floor_id": "floor_2", "capacity": 2, "status": "available", "cafe_id": cafe_id, "current_order_id": None, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "table_7", "name": "T7", "floor_id": "floor_2", "capacity": 4, "status": "available", "cafe_id": cafe_id, "current_order_id": None, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "table_8", "name": "T8", "floor_id": "floor_2", "capacity": 4, "status": "available", "cafe_id": cafe_id, "current_order_id": None, "created_at": "2025-01-01T00:00:00Z"},
        {"id": "table_9", "name": "T9", "floor_id": "floor_2", "capacity": 8, "status": "available", "cafe_id": cafe_id, "current_order_id": None, "created_at": "2025-01-01T00:00:00Z"},
    ]
    
    await db.tables.insert_many(tables)
    print(f"✓ Created {len(tables)} tables")
    
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
    print("\nYou can now:")
    print("  - View menu items in the Order tab")
    print("  - See tables in the Tables tab")
    print("  - Check inventory in the Inventory tab")
    print("  - Create reservations")
    print("  - Process orders and generate bills")


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
    existing_items = await db.menu_items.count_documents({"cafe_id": selected_cafe['id']})
    if existing_items > 0:
        confirm = input(f"\n⚠️  This cafe already has {existing_items} menu items. Continue anyway? (yes/no): ")
        if confirm.lower() != 'yes':
            print("Setup cancelled.")
            return
    
    await setup_sample_data(selected_cafe['id'])
    
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
