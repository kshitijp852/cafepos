# Cafe POS System — Setup Guide

This guide explains how to set up the Cafe POS system locally on your machine.

## Prerequisites

Before you start, install these on your system:

### macOS
```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install required tools
brew install mongodb-community node python@3.13

# Start MongoDB service
brew services start mongodb-community@7.0
```

### Windows / Linux
- **Node.js**: Download from https://nodejs.org (v18 or higher)
- **MongoDB**: Download from https://www.mongodb.com/try/download/community
- **Python**: Download from https://www.python.org (3.9 or higher)
- Start MongoDB according to your OS instructions

## Project Structure

```
pos/
├── backend/              # Python FastAPI backend
│   ├── server.py
│   ├── requirements.txt
│   ├── .env.example     # Copy to .env (see Setup section)
│   └── setup_sample_data.py
├── frontend/            # React frontend
│   ├── src/
│   ├── package.json
│   └── .env.example     # Copy to .env (see Setup section)
├── SETUP.md             # This file
├── CSV_IMPORT_GUIDE.md  # CSV import documentation
└── sample-menu.csv      # Example CSV for testing
```

## Step 1: Clone Repository

```bash
git clone https://github.com/yourusername/pos-system.git
cd pos
```

## Step 2: Set Up Backend

### Create `.env` file for backend

```bash
# Copy the example file
cp backend/.env.example backend/.env

# Edit backend/.env with your configuration
# For local development, defaults should work fine:
MONGO_URL=mongodb://localhost:27017
DB_NAME=pos_database
CORS_ORIGINS=*
JWT_SECRET=your-super-secret-key-change-this
```

### Install Python dependencies

```bash
cd backend
pip install -r requirements.txt
```

### Start the backend server

```bash
# Terminal 1 (keep running)
cd backend
python server.py
```

The backend will start on **http://localhost:8001**

Verify it's working:
```bash
curl http://localhost:8001/api/health
# Should return: {"status":"healthy","database":"connected"}
```

## Step 3: Set Up Frontend

### Create `.env` file for frontend

```bash
# Copy the example file
cp frontend/.env.example frontend/.env

# Frontend .env should contain:
REACT_APP_BACKEND_URL=http://localhost:8001
ENABLE_HEALTH_CHECK=false
WDS_SOCKET_PORT=3000
```

### Install Node dependencies

```bash
cd frontend
npm install
```

### Start the frontend dev server

```bash
# Terminal 2 (keep running)
cd frontend
npm start
```

The frontend will open on **http://localhost:3000**

## Step 4: Create Your First User Account

### Register via API

```bash
curl -X POST "http://localhost:8001/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin@cafe.com",
    "password":"your-strong-password",
    "name":"Admin User",
    "cafe_name":"My Cafe"
  }'
```

### Or register in the UI

1. Open http://localhost:3000
2. Click "Register" (if available)
3. Fill in your details
4. Log in with the credentials you created

## Step 5: Add Menu Items

### Option A: Via Web UI (Recommended)

1. Log in to the app
2. Click **Configure** button in the header
3. Go to **Import Menu** tab
4. Click **Choose CSV File**
5. Select `sample-menu.csv` from the project root
6. Items will be imported automatically
7. Click **Reload Menu** to see updates

### Option B: Via CSV File

Create a file `my-menu.csv`:

```csv
name,price,category
Espresso,80,Coffee
Cappuccino,120,Coffee
Latte,130,Coffee
Sandwich,100,Food
Burger,150,Food
Pasta,180,Food
```

Then import through the UI as shown above.

### Option C: Via API Script

If you want to populate data programmatically:

```bash
cd backend
python setup_sample_data.py
# Select your cafe when prompted
# This creates sample categories, items, tables, and inventory
```

## Step 6: Configure Tables

1. Log in to the app
2. Click **Configure** button
3. Go to **Tables** tab
4. Set number of tables (1-50)
5. Click **Save**
6. Click any table to start taking orders

## Troubleshooting

### MongoDB won't start
```bash
# Check MongoDB status
brew services list | grep mongodb

# If stopped, restart it
brew services restart mongodb-community@7.0

# If port is in use
lsof -i :27017
kill -9 <PID>

# Check MongoDB logs
tail -f /usr/local/var/log/mongodb/mongo.log
```

### Backend won't connect to MongoDB
```bash
# Verify MongoDB is running
mongosh --eval "db.adminCommand('ping')"

# Check connection string in backend/.env
cat backend/.env

# Try connecting directly
mongosh mongodb://localhost:27017
```

### Frontend can't reach backend
```bash
# Verify backend is running
curl http://localhost:8001/api/health

# Check frontend .env has correct URL
cat frontend/.env | grep REACT_APP_BACKEND_URL

# Check if port 8001 is in use
lsof -i :8001
```

### Port already in use
```bash
# Find process using the port
lsof -i :3000          # Frontend
lsof -i :8001          # Backend
lsof -i :27017         # MongoDB

# Kill the process
kill -9 <PID>
```

## Development Tips

### Hot Reload
Both frontend and backend support hot reload during development:
- **Frontend**: Changes to React files auto-reload at http://localhost:3000
- **Backend**: Changes to Python files auto-reload (uvicorn reload mode)

### Database Inspection
```bash
# Start MongoDB shell
mongosh

# Show all databases
show dbs

# Connect to pos database
use pos_database

# View collections
show collections

# Query menu items
db.menu_items.find().limit(5)

# Count items
db.menu_items.countDocuments()
```

### API Testing
```bash
# Get login token
TOKEN=$(curl -s -X POST "http://localhost:8001/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cafe.com","password":"your-password"}' \
  | jq -r '.token')

# Test API endpoint with token
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8001/api/menu/items
```

## Production Deployment

Before deploying to production:

1. **Generate a strong JWT secret**:
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

2. **Update environment variables**:
   ```bash
   # backend/.env
   MONGO_URL=your-production-mongo-url
   DB_NAME=pos_production
   CORS_ORIGINS=https://yourdomain.com
   JWT_SECRET=<your-strong-secret>
   ```

3. **Build frontend for production**:
   ```bash
   cd frontend
   npm run build
   ```

4. **Update backend for production**:
   - Use a production WSGI server (e.g., Gunicorn)
   - Enable HTTPS
   - Set appropriate CORS origins

5. **Database backup**:
   ```bash
   mongodump --uri="mongodb://localhost:27017/pos_database" --out=backup/
   ```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review error messages in browser console (Frontend → F12)
3. Check backend logs in terminal where you ran `python server.py`
4. Check MongoDB logs: `brew log mongodb-community@7.0`

## License

[Add your license here]
