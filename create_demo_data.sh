#!/bin/bash

CAFE_ID="4f5546bb-ad0b-4678-91aa-bbd9be66bc30"
FLOOR_ID="8a57413f-53ec-421b-a9c1-9306bcd96ff7"
BASE_URL="http://localhost:8001/api"

echo "Creating more tables..."
curl -s "$BASE_URL/tables" -H "Content-Type: application/json" -d "{\"name\":\"Table 2\",\"floor_id\":\"$FLOOR_ID\",\"capacity\":2,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null
curl -s "$BASE_URL/tables" -H "Content-Type: application/json" -d "{\"name\":\"Table 3\",\"floor_id\":\"$FLOOR_ID\",\"capacity\":4,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null
curl -s "$BASE_URL/tables" -H "Content-Type: application/json" -d "{\"name\":\"Table 4\",\"floor_id\":\"$FLOOR_ID\",\"capacity\":6,\"cafe_id\":\"$CAFE_ID\"}" > /dev/null

echo "Creating categories..."
curl -s "$BASE_URL/menu/categories" -H "Content-Type: application/json" -d "{\"name\":\"Beverages\",\"cafe_id\":\"$CAFE_ID\"}" > /dev/null
curl -s "$BASE_URL/menu/categories" -H "Content-Type: application/json" -d "{\"name\":\"Food\",\"cafe_id\":\"$CAFE_ID\"}" > /dev/null

echo "Demo data created!"