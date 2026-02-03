#!/bin/bash

CAFE_ID="f094f39e-878c-49ff-98ff-4a8ad657a965"
BEVERAGES_ID="ffb4ad7f-153c-4659-94bd-388c5c690c01"
FASTFOOD_ID="1920676c-78aa-4de7-9dc4-fe9540d614e1"
SNACKS_ID="083394d9-3e8c-4210-8523-fcf678eac773"
DESSERTS_ID="838f5f8a-e8eb-4138-8caa-cd5e0d4d1b58"
BASE_URL="http://localhost:8001/api"

echo "Adding more beverages..."
curl -s "$BASE_URL/menu/items" -H "Content-Type: application/json" -d "{\"name\":\"Cold Coffee\",\"price\":120,\"category_id\":\"$BEVERAGES_ID\",\"description\":\"Chilled coffee drink\",\"available\":true,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null
curl -s "$BASE_URL/menu/items" -H "Content-Type: application/json" -d "{\"name\":\"Lemon Tea\",\"price\":50,\"category_id\":\"$BEVERAGES_ID\",\"description\":\"Fresh lemon tea\",\"available\":true,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null
curl -s "$BASE_URL/menu/items" -H "Content-Type: application/json" -d "{\"name\":\"Fresh Juice\",\"price\":80,\"category_id\":\"$BEVERAGES_ID\",\"description\":\"Mixed fruit juice\",\"available\":true,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null

echo "Adding more fast food..."
curl -s "$BASE_URL/menu/items" -H "Content-Type: application/json" -d "{\"name\":\"Sandwich\",\"price\":100,\"category_id\":\"$FASTFOOD_ID\",\"description\":\"Veg sandwich\",\"available\":true,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null
curl -s "$BASE_URL/menu/items" -H "Content-Type: application/json" -d "{\"name\":\"Pasta\",\"price\":180,\"category_id\":\"$FASTFOOD_ID\",\"description\":\"Italian pasta\",\"available\":true,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null
curl -s "$BASE_URL/menu/items" -H "Content-Type: application/json" -d "{\"name\":\"Noodles\",\"price\":120,\"category_id\":\"$FASTFOOD_ID\",\"description\":\"Hakka noodles\",\"available\":true,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null

echo "Adding snacks..."
curl -s "$BASE_URL/menu/items" -H "Content-Type: application/json" -d "{\"name\":\"French Fries\",\"price\":80,\"category_id\":\"$SNACKS_ID\",\"description\":\"Crispy fries\",\"available\":true,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null
curl -s "$BASE_URL/menu/items" -H "Content-Type: application/json" -d "{\"name\":\"Samosa\",\"price\":30,\"category_id\":\"$SNACKS_ID\",\"description\":\"Indian snack\",\"available\":true,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null
curl -s "$BASE_URL/menu/items" -H "Content-Type: application/json" -d "{\"name\":\"Spring Roll\",\"price\":60,\"category_id\":\"$SNACKS_ID\",\"description\":\"Veg spring roll\",\"available\":true,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null

echo "Adding desserts..."
curl -s "$BASE_URL/menu/items" -H "Content-Type: application/json" -d "{\"name\":\"Ice Cream\",\"price\":60,\"category_id\":\"$DESSERTS_ID\",\"description\":\"Vanilla ice cream\",\"available\":true,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null
curl -s "$BASE_URL/menu/items" -H "Content-Type: application/json" -d "{\"name\":\"Brownie\",\"price\":80,\"category_id\":\"$DESSERTS_ID\",\"description\":\"Chocolate brownie\",\"available\":true,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null
curl -s "$BASE_URL/menu/items" -H "Content-Type: application/json" -d "{\"name\":\"Cake Slice\",\"price\":100,\"category_id\":\"$DESSERTS_ID\",\"description\":\"Fresh cake slice\",\"available\":true,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null

echo "Menu items added successfully!"