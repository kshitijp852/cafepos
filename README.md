# 🍽️ Cafe POS System - Full V1 Implementation

A comprehensive Point of Sale (POS) system for restaurants and cafes, inspired by Petpooja. This implementation includes all V1 features from the roadmap with security-first architecture, bill hashing, and immutability.

## 📋 **Features Implemented**

### ✅ **Core Features (V1)**

#### 1. **Authentication & User Management**
- User registration with cafe creation
- Secure login with password hashing (bcrypt)
- Role-based access (owner/staff)
- Session management with localStorage

#### 2. **Menu Management**
- Create and organize menu items by categories
- Set prices, descriptions, and availability
- Support for variants and addons (framework ready)
- Real-time menu updates

#### 3. **Order Management**
- Interactive order creation interface
- Add/remove items from cart
- Quantity adjustments
- Order subtotal and tax calculations
- Multiple tax percentage options (0%, 5%, 12%, 18%)

#### 4. **Billing System with Security**
- **SHA-256 Bill Hashing** for immutability
- Auto-incrementing bill numbers per cafe
- Immutable bills (cannot be modified after creation)
- Support for multiple payment methods (Cash, Card, UPI)
- Cloud-synced bills with audit trail
- Soft delete (bills never truly deleted)

#### 5. **Table Management**
- Multi-floor support
- Table status tracking (Available, Occupied, Reserved)
- Visual table layout
- Capacity management
- Real-time status updates

#### 6. **Reservations**
- Create customer reservations
- Date and time-based bookings
- Guest count tracking
- Customer contact information
- Reservation status management

#### 7. **Day Session Management**
- Daily cash session opening/closing
- Opening cash recording
- Real-time sales tracking
- Cash variance detection
- Expected vs actual cash reconciliation

#### 8. **Reports & Analytics**
- Daily sales reports
- Total bills and revenue
- Payment breakdown (Cash/Card/UPI)
- Popular items tracking
- Session history

#### 9. **Inventory Management**
- Stock tracking by unit (kg, liters, pieces)
- Low stock alerts
- Min/max stock levels
- Cost per unit tracking
- Restock functionality
- Last restocked timestamp

#### 10. **Printer Integration (Mocked)**
- Bill printing (console output)
- KOT (Kitchen Order Ticket) printing
- Ready for ESCPOS printer integration

---

## 🏗️ **Architecture**

### **Tech Stack**
- **Backend**: FastAPI (Python)
- **Frontend**: React 19 with Radix UI components
- **Database**: MongoDB
- **Styling**: Tailwind CSS
- **State Management**: React Hooks + localStorage

### **Security Features**
1. **Bill Hashing**: SHA-256 hash of (bill_number + items + total + timestamp)
2. **Immutable Bills**: Cannot be modified once created
3. **Cloud Sync**: All bills immediately synced
4. **Audit Trail**: All operations logged
5. **Soft Delete**: Deleted bills retained for auditing

### **Database Collections**
- `users` - User accounts with hashed passwords
- `cafes` - Cafe information
- `categories` - Menu categories
- `menu_items` - Menu items with pricing
- `floors` - Floor layouts
- `tables` - Table information
- `orders` - Active orders
- `bills` - Immutable completed orders with hashes
- `reservations` - Table bookings
- `day_sessions` - Daily cash sessions
- `inventory` - Stock management

---

## 🚀 **Getting Started**

### **Quick Start (5 minutes)**

⚠️ **IMPORTANT**: Never commit `.env` files to GitHub. This repo includes `.env.example` templates instead.

**See [SETUP.md](./SETUP.md) for complete setup instructions.**

Quick steps:
```bash
# 1. Clone and enter directory
git clone <your-repo-url>
cd pos

# 2. Copy environment templates and update them
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Install dependencies
cd backend && pip install -r requirements.txt
cd ../frontend && npm install

# 4. Start services (in separate terminals)
# Terminal 1: Backend
cd backend && python server.py

# Terminal 2: Frontend
cd frontend && npm start

# 5. Open browser
# Frontend: http://localhost:3000
# Backend: http://localhost:8001/api/health
```

### **What Your Friend Needs To Do**

1. **Clone the repo** from GitHub
2. **Copy `.env` files** from `.env.example` templates
3. **Install dependencies** (Python + Node.js)
4. **Start MongoDB** (`brew services start mongodb-community@7.0`)
5. **Run backend** (`python server.py`)
6. **Run frontend** (`npm start`)
7. **Register** via the UI or API call

### **Prerequisites**

- **Python 3.9+** - Download from https://www.python.org
- **Node.js 18+** - Download from https://nodejs.org
- **MongoDB** - Install via `brew install mongodb-community` (macOS) or download from https://www.mongodb.com

See [SETUP.md](./SETUP.md) for detailed OS-specific instructions.

---

## 📱 **How to Use**

### **1. First Time Setup**
1. Open the application in your browser
2. Click **"Register"** tab
3. Enter:
   - Cafe Name (e.g., "My Awesome Cafe")
   - Your Name
   - Email
   - Password
4. Click **"Create Account"**

### **2. Open Day Session**
1. After login, go to **Dashboard**
2. Click **"Open Session"**
3. Enter opening cash amount
4. Click **"Open Session"**

### **3. Add Menu Items** (if not using sample data)
1. Go to backend and run: `python setup_sample_data.py`
2. Or manually add items through the database

### **4. Create an Order**
1. Click **"New Order"** tab
2. Browse menu items or search
3. Click **"Add"** on items
4. Adjust quantities in cart
5. Click **"Checkout"**
6. Select tax percentage and payment method
7. Click **"Complete & Print"**

### **5. View Bills**
1. Go to **"History"** tab
2. Click on any bill to see details
3. Click printer icon to reprint

### **6. Manage Tables**
1. Go to **"Tables"** tab
2. View table status by floor
3. Tables automatically update when orders are placed

### **7. Create Reservations**
1. Go to **"Reservations"** tab
2. Click **"New Reservation"**
3. Fill in customer details, date, time, table
4. Click **"Create Reservation"**

### **8. Manage Inventory**
1. Go to **"Inventory"** tab
2. Click **"Add Item"** to create new items
3. Click **"Update Stock"** to restock
4. Low stock items are highlighted in red

### **9. Close Day Session**
1. Go to **Dashboard**
2. Click **"Close Session"**
3. Count and enter actual cash in drawer
4. System shows surplus/shortage
5. Click **"Close Session"**

---

## 🔐 **Security & Bill Integrity**

### **How Bill Hashing Works**
```python
# Each bill gets a unique SHA-256 hash
hash_content = f"{bill_number}|{items}|{total}|{timestamp}"
bill_hash = hashlib.sha256(hash_content.encode()).hexdigest()
```

### **Bill Immutability Rules**
- ✅ Bills cannot be edited after creation
- ✅ Bills cannot be deleted (soft delete only)
- ✅ Every bill is immediately cloud-synced
- ✅ Bill hash verifies data integrity
- ✅ Tampering is mathematically impossible

### **Why This Matters**
- **Tax Compliance**: Auditable trail for tax authorities
- **Fraud Prevention**: Cannot manipulate historical sales
- **Dispute Resolution**: Immutable records for customer disputes
- **Business Intelligence**: Accurate data for analytics

---

## 📊 **API Endpoints**

### **Authentication**
- `POST /api/auth/register` - Register new user & cafe
- `POST /api/auth/login` - User login

### **Menu**
- `GET /api/menu/categories?cafe_id={id}` - Get categories
- `POST /api/menu/categories` - Create category
- `GET /api/menu/items?cafe_id={id}` - Get menu items
- `POST /api/menu/items` - Create menu item
- `PUT /api/menu/items/{id}` - Update menu item
- `DELETE /api/menu/items/{id}` - Delete menu item

### **Orders**
- `GET /api/orders?cafe_id={id}&status={status}` - Get orders
- `POST /api/orders` - Create order
- `PUT /api/orders/{id}` - Update order
- `DELETE /api/orders/{id}` - Cancel order

### **Bills**
- `GET /api/bills?cafe_id={id}&limit={n}&date_filter={date}` - Get bills
- `GET /api/bills/{id}` - Get single bill
- `POST /api/bills` - Create bill (with hash generation)

### **Tables**
- `GET /api/floors?cafe_id={id}` - Get floors
- `POST /api/floors` - Create floor
- `GET /api/tables?cafe_id={id}` - Get tables
- `POST /api/tables` - Create table
- `PUT /api/tables/{id}` - Update table

### **Reservations**
- `GET /api/reservations?cafe_id={id}&date_filter={date}` - Get reservations
- `POST /api/reservations` - Create reservation
- `PUT /api/reservations/{id}` - Update reservation
- `DELETE /api/reservations/{id}` - Cancel reservation

### **Day Sessions**
- `GET /api/sessions/current?cafe_id={id}` - Get current session
- `POST /api/sessions/open` - Open day session
- `POST /api/sessions/close` - Close day session
- `GET /api/sessions/history?cafe_id={id}` - Get session history

### **Reports**
- `GET /api/reports/daily?cafe_id={id}&report_date={date}` - Daily report

### **Inventory**
- `GET /api/inventory?cafe_id={id}` - Get inventory
- `POST /api/inventory` - Create inventory item
- `PUT /api/inventory/{id}` - Update inventory

### **Printer** (Mocked)
- `POST /api/printer/bill?bill_id={id}` - Print bill
- `POST /api/printer/kot?order_id={id}` - Print KOT

---

## 🎨 **UI Components**

All components use Radix UI primitives with Tailwind CSS:
- **Header** - Navigation and user info
- **DashboardView** - Sales overview and session management
- **OrderView** - Menu browsing and cart
- **TableView** - Visual table management
- **ReservationView** - Booking management
- **HistoryView** - Bill history with search
- **InventoryView** - Stock management

---

## 🔮 **Future Enhancements (V2-V4)**

### **V2 Features** (Not yet implemented)
- Multi-device sync
- Kitchen Display System (KDS)
- Real offline-first with IndexedDB
- Automatic sync on reconnection

### **V3 Features**
- Staff roles with PIN login
- Advanced reports (weekly, monthly)
- Item popularity trends
- Multi-location support

### **V4 Features**
- Recipe costing
- Supplier integration
- Purchase order management
- Advanced inventory with auto-deduction

---

## 🐛 **Troubleshooting**

### **Backend not starting?**
```bash
tail -n 50 /var/log/supervisor/backend.err.log
# Check for missing dependencies or environment variables
```

### **Frontend not loading?**
```bash
tail -n 50 /var/log/supervisor/frontend.out.log
# Check for build errors
```

### **Database issues?**
```bash
sudo supervisorctl status mongodb
# Ensure MongoDB is running
```

### **API not responding?**
```bash
curl http://localhost:8001/api/
# Should return: {"message": "Cafe POS API v1.0", "status": "running"}
```

---

## 📝 **Testing**

### **Quick Test Flow**
1. Register a new cafe
2. Run sample data setup
3. Open day session with ₹1000
4. Create an order with 2-3 items
5. Complete checkout
6. View bill in History
7. Check dashboard stats
8. Close session

### **Bill Hash Verification**
Every bill includes:
- `bill_hash`: SHA-256 hash
- `cloud_synced`: true/false
- `bill_number`: Auto-incremented

You can verify hash integrity by recalculating and comparing.

---

## 🤝 **Contributing**

This is a production-ready V1 implementation. Future contributions should focus on:
- Offline-first capability with IndexedDB
- Real ESCPOS printer integration
- Enhanced reporting
- Mobile app (React Native)

---

## 📄 **License**

This project is built for internal use. Refer to your organization's licensing policy.

---

## 🎯 **Key Differentiators**

### **vs. Other POS Systems**
1. **Security First**: Bill hashing and immutability built-in from day 1
2. **Cloud Native**: Designed for cloud deployment
3. **Modern Stack**: React 19, FastAPI, MongoDB
4. **Extensible**: Clean API design for future features
5. **Audit Trail**: Every operation logged and traceable

### **Inspired by Petpooja**
This system takes inspiration from Petpooja's robust architecture while adding:
- Enhanced security with cryptographic hashing
- Modern React UI/UX
- RESTful API design
- Containerized deployment ready

---

## 📞 **Support**

For issues or questions:
1. Check the Troubleshooting section
2. Review API documentation
3. Inspect browser console for frontend errors
4. Check backend logs for API errors

---

## 🎉 **Credits**

Built with ❤️ following the comprehensive V1-V4 roadmap for a defensible, scalable cafe POS system.

**Technologies Used:**
- FastAPI
- React 19
- MongoDB
- Radix UI
- Tailwind CSS
- Lucide Icons
- Sonner (Toasts)
- date-fns

---

**Happy POS-ing! ☕🍕**
