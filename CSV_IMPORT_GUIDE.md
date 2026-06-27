# CSV Menu Import Guide

## Overview
You can now bulk import your menu items using a CSV file. The system will automatically create categories and menu items from your CSV data.

## CSV Format

Your CSV file must have at least 2 columns:
- **name** - Item name (required)
- **price** - Item price in numbers (required)
- **category** - Item category (optional, defaults to "General")

### Example CSV Format
```
name,price,category
Espresso,80,Coffee
Americano,90,Coffee
Biryani,250,Main Courses
Paneer Tikka,240,Main Courses
```

## How to Use

1. **Open Dashboard** → Click "Configure Tables" button
2. **Go to "Import Menu" tab**
3. **Click "Upload CSV File"** and select your CSV file
4. System will automatically:
   - Parse the CSV
   - Create categories (if they don't exist)
   - Create menu items under their categories
   - Show import success message with item count

## CSV Rules

- **Column Names**: Use any of these variations:
  - For item name: "name", "item", "item_name"
  - For price: "price", "cost", "amount"
  - For category: "category", "cat", "type"

- **Price Format**: Must be a valid number (80, 90.50, etc.)

- **Empty Rows**: Will be skipped automatically

- **Duplicates**: If item already exists, it will be skipped

- **Encoding**: UTF-8 (standard for CSV files)

## Sample CSV

See `sample-menu.csv` in the project root for a complete example with:
- Coffee items (6 items)
- Beverages (4 items)
- Shakes (4 items)
- Main Courses (5 items)
- Breads (4 items)
- Appetizers (4 items)
- Desserts (4 items)

## Troubleshooting

### "CSV must have at least a header row and one data row"
- Make sure your CSV has a header row and at least one data row

### "CSV must have 'name' and 'price' columns"
- Check that your column headers match the required format
- Column names are case-insensitive but must contain "name" and "price"

### "No valid items found in CSV"
- All rows were skipped, likely due to:
  - Missing name or price in data rows
  - Invalid price format (must be a number)

### Items not appearing after import
- Refresh the page to see newly imported items
- Check the success message for how many items were imported

## Tips

- **Keep it Simple**: Start with the sample CSV and modify it
- **Test First**: Upload small batches to verify format
- **Bulk Operations**: You can import hundreds of items at once
- **Categories Auto-Create**: No need to create categories first
- **Easy Updates**: Reimport after modifying your CSV file

## Example Files

### Basic Restaurant Menu
```csv
name,price,category
Biryani,250,Mains
Butter Chicken,280,Mains
Samosa,30,Starters
Gulab Jamun,60,Desserts
```

### Cafe Menu
```csv
name,price,category
Espresso,80,Coffee
Latte,120,Coffee
Sandwich,150,Food
Cake,100,Food
```

### Quick Service Restaurant
```csv
name,price
Burger,150
Pizza,250
Fries,80
Coke,50
```
