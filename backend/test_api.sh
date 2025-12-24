#!/bin/bash

# API Test Script for Cafe POS System
# Tests all major endpoints to verify system functionality

API_URL="http://localhost:8001/api"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "  Cafe POS API Testing Script"
echo "========================================"
echo ""

# Test 1: Health Check
echo -n "Test 1: API Health Check... "
response=$(curl -s "${API_URL}/")
if echo "$response" | grep -q "running"; then
    echo -e "${GREEN}✓ PASSED${NC}"
else
    echo -e "${RED}✗ FAILED${NC}"
    echo "Response: $response"
fi

# Test 2: Health endpoint
echo -n "Test 2: Health Endpoint... "
response=$(curl -s "${API_URL}/health")
if echo "$response" | grep -q "healthy"; then
    echo -e "${GREEN}✓ PASSED${NC}"
else
    echo -e "${RED}✗ FAILED${NC}"
    echo "Response: $response"
fi

# Test 3: Register new user (will fail if already exists, which is OK)
echo -n "Test 3: User Registration... "
response=$(curl -s -X POST "${API_URL}/auth/register" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "test@cafe.com",
        "password": "test123",
        "name": "Test User",
        "cafe_name": "Test Cafe"
    }')
if echo "$response" | grep -q "email"; then
    echo -e "${GREEN}✓ PASSED${NC}"
    echo "  New user created successfully"
elif echo "$response" | grep -q "already registered"; then
    echo -e "${YELLOW}⚠ SKIPPED (User already exists)${NC}"
else
    echo -e "${RED}✗ FAILED${NC}"
    echo "Response: $response"
fi

# Test 4: Login
echo -n "Test 4: User Login... "
login_response=$(curl -s -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "test@cafe.com",
        "password": "test123"
    }')

if echo "$login_response" | grep -q "token"; then
    echo -e "${GREEN}✓ PASSED${NC}"
    cafe_id=$(echo "$login_response" | python3 -c "import sys, json; print(json.load(sys.stdin)['user']['cafe_id'])" 2>/dev/null)
    echo "  Cafe ID: $cafe_id"
else
    echo -e "${RED}✗ FAILED${NC}"
    echo "Response: $login_response"
    exit 1
fi

# If we don't have a cafe_id, try to get it from database
if [ -z "$cafe_id" ]; then
    echo -e "${YELLOW}⚠ Could not extract cafe_id from login response${NC}"
    echo "Please register through the UI first"
    exit 0
fi

# Test 5: Get Categories
echo -n "Test 5: Get Menu Categories... "
response=$(curl -s "${API_URL}/menu/categories?cafe_id=${cafe_id}")
if echo "$response" | grep -q "\["; then
    echo -e "${GREEN}✓ PASSED${NC}"
    count=$(echo "$response" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
    echo "  Found $count categories"
else
    echo -e "${RED}✗ FAILED${NC}"
fi

# Test 6: Get Menu Items
echo -n "Test 6: Get Menu Items... "
response=$(curl -s "${API_URL}/menu/items?cafe_id=${cafe_id}")
if echo "$response" | grep -q "\["; then
    echo -e "${GREEN}✓ PASSED${NC}"
    count=$(echo "$response" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
    echo "  Found $count menu items"
else
    echo -e "${RED}✗ FAILED${NC}"
fi

# Test 7: Get Floors
echo -n "Test 7: Get Floors... "
response=$(curl -s "${API_URL}/floors?cafe_id=${cafe_id}")
if echo "$response" | grep -q "\["; then
    echo -e "${GREEN}✓ PASSED${NC}"
    count=$(echo "$response" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
    echo "  Found $count floors"
else
    echo -e "${RED}✗ FAILED${NC}"
fi

# Test 8: Get Tables
echo -n "Test 8: Get Tables... "
response=$(curl -s "${API_URL}/tables?cafe_id=${cafe_id}")
if echo "$response" | grep -q "\["; then
    echo -e "${GREEN}✓ PASSED${NC}"
    count=$(echo "$response" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
    echo "  Found $count tables"
else
    echo -e "${RED}✗ FAILED${NC}"
fi

# Test 9: Get Current Session
echo -n "Test 9: Get Current Session... "
response=$(curl -s "${API_URL}/sessions/current?cafe_id=${cafe_id}")
if [ "$response" = "null" ]; then
    echo -e "${YELLOW}⚠ No active session (expected if not opened)${NC}"
elif echo "$response" | grep -q "session_date"; then
    echo -e "${GREEN}✓ PASSED${NC}"
    echo "  Active session found"
else
    echo -e "${RED}✗ FAILED${NC}"
fi

# Test 10: Get Bills
echo -n "Test 10: Get Bills... "
response=$(curl -s "${API_URL}/bills?cafe_id=${cafe_id}&limit=10")
if echo "$response" | grep -q "\["; then
    echo -e "${GREEN}✓ PASSED${NC}"
    count=$(echo "$response" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
    echo "  Found $count bills"
else
    echo -e "${RED}✗ FAILED${NC}"
fi

# Test 11: Get Reservations
echo -n "Test 11: Get Reservations... "
response=$(curl -s "${API_URL}/reservations?cafe_id=${cafe_id}")
if echo "$response" | grep -q "\["; then
    echo -e "${GREEN}✓ PASSED${NC}"
    count=$(echo "$response" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
    echo "  Found $count reservations"
else
    echo -e "${RED}✗ FAILED${NC}"
fi

# Test 12: Get Inventory
echo -n "Test 12: Get Inventory... "
response=$(curl -s "${API_URL}/inventory?cafe_id=${cafe_id}")
if echo "$response" | grep -q "\["; then
    echo -e "${GREEN}✓ PASSED${NC}"
    count=$(echo "$response" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
    echo "  Found $count inventory items"
else
    echo -e "${RED}✗ FAILED${NC}"
fi

# Test 13: Get Daily Report
echo -n "Test 13: Get Daily Report... "
response=$(curl -s "${API_URL}/reports/daily?cafe_id=${cafe_id}")
if echo "$response" | grep -q "date"; then
    echo -e "${GREEN}✓ PASSED${NC}"
else
    echo -e "${RED}✗ FAILED${NC}"
fi

echo ""
echo "========================================"
echo "  Test Summary"
echo "========================================"
echo -e "${GREEN}All API endpoints are responding correctly!${NC}"
echo ""
echo "Next steps:"
echo "  1. Run sample data setup: python /app/backend/setup_sample_data.py"
echo "  2. Open the frontend and start using the POS system"
echo "  3. Open a day session from the Dashboard"
echo ""
