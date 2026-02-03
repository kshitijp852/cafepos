# Cafe POS System

**Version 1.0** | **Production Ready** | **Enterprise Grade**

A comprehensive, security-first Point of Sale (POS) system designed for restaurants, cafes, and food service establishments. Built with modern technologies and industry best practices to deliver reliable, scalable, and auditable billing operations.

---

## Overview

Cafe POS is an enterprise-grade billing and order management system that prioritizes data integrity, security, and operational efficiency. The system implements cryptographic bill verification, immutable transaction records, and comprehensive audit trails to meet compliance requirements and prevent fraud.

### Key Capabilities

- **Secure Billing**: SHA-256 cryptographic hashing ensures bill immutability and tamper-proof records
- **Multi-entity Support**: Manage multiple floors, tables, and concurrent orders
- **Financial Controls**: Day-end reconciliation with cash variance detection
- **Inventory Management**: Real-time stock tracking with automated low-stock alerts
- **Comprehensive Reporting**: Daily sales analytics, payment breakdowns, and trend analysis

---

## Architecture

### Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Backend** | FastAPI | Latest |
| **Frontend** | React | 19.x |
| **Database** | MongoDB | 6.x |
| **UI Framework** | Radix UI + Tailwind CSS | Latest |
| **Authentication** | bcrypt | Industry Standard |

### System Design

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Dashboard   │  │  Order Mgmt  │  │   Reports    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ REST API
┌────────────────────────▼────────────────────────────────┐
│                  Backend (FastAPI)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Auth Layer  │  │  Business    │  │   Security   │  │
│  │              │  │  Logic       │  │   (Hashing)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                  Database (MongoDB)                      │
│     Collections: users, cafes, orders, bills, etc.      │
└─────────────────────────────────────────────────────────┘
```

---

## Core Features

### 1. Authentication & Access Control
- Secure user registration with bcrypt password hashing
- Role-based access control (Owner/Staff)
- Session management with token-based authentication
- Multi-cafe support with data isolation

### 2. Menu Management
- Hierarchical category organization
- Dynamic pricing and availability control
- Support for variants and add-ons
- Real-time menu synchronization

### 3. Order Processing
- Interactive order creation interface
- Shopping cart functionality
- Configurable tax rates (0%, 5%, 12%, 18%)
- Multi-item quantity management

### 4. Secure Billing System

**Cryptographic Security:**
```
Bill Hash = SHA-256(bill_number + items + total + timestamp)
```

**Features:**
- Immutable bills (cannot be modified post-creation)
- Auto-incrementing bill numbers per cafe
- Multi-payment method support (Cash, Card, UPI)
- Cloud synchronization with audit trail
- Soft delete for compliance (bills never permanently removed)

**Security Benefits:**
- Tax authority compliance
- Fraud prevention
- Dispute resolution capability
- Accurate business intelligence

### 5. Table Management
- Multi-floor layout support
- Real-time table status (Available, Occupied, Reserved)
- Capacity tracking and management
- Visual floor plan interface

### 6. Reservation System
- Date and time-based booking management
- Guest count tracking
- Customer contact information storage
- Reservation status workflow

### 7. Day Session Management
- Daily cash session controls (open/close)
- Opening balance recording
- Real-time sales aggregation
- Cash variance detection (expected vs. actual)
- End-of-day reconciliation reports

### 8. Analytics & Reporting
- Daily sales summaries
- Revenue and transaction volume metrics
- Payment method breakdown
- Popular item analysis
- Historical session data

### 9. Inventory Management
- Multi-unit stock tracking (kg, liters, pieces)
- Configurable min/max stock levels
- Automated low-stock alerts
- Cost per unit tracking
- Restock logging with timestamps

### 10. Printer Integration
- Bill receipt printing
- Kitchen Order Ticket (KOT) generation
- ESC/POS printer protocol support (ready for integration)

---

## Installation

### Prerequisites

- Python 3.11 or higher
- Node.js 18.x or higher
- MongoDB 6.x
- Yarn package manager

### Backend Setup

```bash
cd backend

# Configure environment variables
# MONGO_URL, DB_NAME, CORS_ORIGINS

# Install dependencies
pip install -r requirements.txt

# Start server (default: http://0.0.0.0:8001)
uvicorn server:app --host 0.0.0.0 --port 8001
```

### Frontend Setup

```bash
cd frontend

# Configure environment variables
# REACT_APP_BACKEND_URL

# Install dependencies
yarn install

# Start development server (default: http://0.0.0.0:3000)
yarn start
```

### Production Deployment

Services are managed via Supervisor:

```bash
# Check service status
sudo supervisorctl status

# Restart services
sudo supervisorctl restart backend
sudo supervisorctl restart frontend
sudo supervisorctl restart all
```

### Sample Data Initialization

```bash
cd backend
python setup_sample_data.py
```

This creates:
- 4 menu categories
- 16 menu items across beverages, food, desserts, and snacks
- 2 floors (Ground & First Floor)
- 9 tables with varying capacities
- 5 inventory items

---

## API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user and cafe |
| POST | `/api/auth/login` | User authentication |

### Menu Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/menu/categories?cafe_id={id}` | Retrieve categories |
| POST | `/api/menu/categories` | Create category |
| GET | `/api/menu/items?cafe_id={id}` | Retrieve menu items |
| POST | `/api/menu/items` | Create menu item |
| PUT | `/api/menu/items/{id}` | Update menu item |
| DELETE | `/api/menu/items/{id}` | Delete menu item |

### Order Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders?cafe_id={id}&status={status}` | Retrieve orders |
| POST | `/api/orders` | Create order |
| PUT | `/api/orders/{id}` | Update order |
| DELETE | `/api/orders/{id}` | Cancel order |

### Billing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bills?cafe_id={id}&limit={n}&date_filter={date}` | Retrieve bills |
| GET | `/api/bills/{id}` | Retrieve single bill |
| POST | `/api/bills` | Create bill with hash generation |

### Table Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/floors?cafe_id={id}` | Retrieve floors |
| POST | `/api/floors` | Create floor |
| GET | `/api/tables?cafe_id={id}` | Retrieve tables |
| POST | `/api/tables` | Create table |
| PUT | `/api/tables/{id}` | Update table |

### Reservations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reservations?cafe_id={id}&date_filter={date}` | Retrieve reservations |
| POST | `/api/reservations` | Create reservation |
| PUT | `/api/reservations/{id}` | Update reservation |
| DELETE | `/api/reservations/{id}` | Cancel reservation |

### Day Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions/current?cafe_id={id}` | Get current session |
| POST | `/api/sessions/open` | Open day session |
| POST | `/api/sessions/close` | Close day session |
| GET | `/api/sessions/history?cafe_id={id}` | Get session history |

### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/daily?cafe_id={id}&report_date={date}` | Daily sales report |

### Inventory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inventory?cafe_id={id}` | Retrieve inventory |
| POST | `/api/inventory` | Create inventory item |
| PUT | `/api/inventory/{id}` | Update inventory |

### Printer (Mock Implementation)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/printer/bill?bill_id={id}` | Print bill receipt |
| POST | `/api/printer/kot?order_id={id}` | Print kitchen order ticket |

---

## User Guide

### Initial Setup

1. **Registration**
   - Navigate to the registration page
   - Enter cafe name, owner name, email, and password
   - Submit to create account and cafe entity

2. **Day Session Initialization**
   - Access Dashboard after login
   - Click "Open Session"
   - Enter opening cash amount
   - Confirm to start session

3. **Menu Configuration**
   - Execute `python setup_sample_data.py` for sample data
   - Or manually configure via database

### Daily Operations

**Creating Orders:**
1. Navigate to "New Order" tab
2. Browse or search menu items
3. Add items to cart
4. Adjust quantities as needed
5. Proceed to checkout
6. Select tax rate and payment method
7. Complete transaction and print receipt

**Viewing Transaction History:**
1. Navigate to "History" tab
2. Browse or search bills
3. View detailed bill information
4. Reprint receipts as needed

**Table Management:**
1. Navigate to "Tables" tab
2. View table status by floor
3. Tables auto-update with order placement

**Reservation Management:**
1. Navigate to "Reservations" tab
2. Click "New Reservation"
3. Enter customer details, date, time, and table
4. Submit reservation

**Inventory Management:**
1. Navigate to "Inventory" tab
2. Add new items or update stock
3. Monitor low-stock alerts (highlighted items)

**Closing Day Session:**
1. Navigate to Dashboard
2. Click "Close Session"
3. Enter actual cash count
4. Review variance (surplus/shortage)
5. Confirm session closure

---

## Database Schema

### Collections

| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `users` | User accounts | email, password_hash, role, cafe_id |
| `cafes` | Cafe entities | name, owner_id, created_at |
| `categories` | Menu categories | name, cafe_id, order |
| `menu_items` | Menu items | name, category_id, price, cafe_id |
| `floors` | Floor layouts | name, cafe_id, order |
| `tables` | Table entities | number, floor_id, capacity, status |
| `orders` | Active orders | cafe_id, items, status, total |
| `bills` | Completed orders | bill_number, items, total, hash, cloud_synced |
| `reservations` | Bookings | customer_name, table_id, date, time |
| `day_sessions` | Cash sessions | cafe_id, opening_cash, closing_cash, date |
| `inventory` | Stock items | name, quantity, unit, min_stock, cafe_id |

---

## Security & Compliance

### Bill Integrity Mechanism

**Hash Generation:**
```python
hash_content = f"{bill_number}|{items}|{total}|{timestamp}"
bill_hash = hashlib.sha256(hash_content.encode()).hexdigest()
```

**Immutability Rules:**
- Bills are read-only post-creation
- Soft delete only (audit trail preserved)
- Cloud synchronization mandatory
- Hash verification on retrieval
- Tampering detection via hash mismatch

**Compliance Benefits:**
- Tax authority audit support
- Fraud prevention
- Dispute resolution
- Accurate business intelligence

---

## Troubleshooting

### Backend Issues

**Service Not Starting:**
```bash
tail -n 50 /var/log/supervisor/backend.err.log
```
Check for:
- Missing dependencies
- Environment variable configuration
- Port conflicts

### Frontend Issues

**Application Not Loading:**
```bash
tail -n 50 /var/log/supervisor/frontend.out.log
```
Check for:
- Build errors
- API connectivity
- Environment configuration

### Database Issues

**Connection Problems:**
```bash
sudo supervisorctl status mongodb
```
Ensure MongoDB service is running

### API Connectivity

**Health Check:**
```bash
curl http://localhost:8001/api/
```
Expected response:
```json
{
  "message": "Cafe POS API v1.0",
  "status": "running"
}
```

---

## Testing

### Verification Workflow

1. Register new cafe
2. Initialize sample data
3. Open day session with ₹1000
4. Create order with multiple items
5. Complete checkout
6. Verify bill in History
7. Check dashboard statistics
8. Close session and verify reconciliation

### Bill Hash Verification

Each bill contains:
- `bill_hash`: SHA-256 cryptographic hash
- `cloud_synced`: Synchronization status
- `bill_number`: Auto-incremented identifier

Verify integrity by recalculating hash and comparing values.

---

## Roadmap

### Version 2.0 (Planned)
- Multi-device synchronization
- Kitchen Display System (KDS)
- Offline-first with IndexedDB
- Automatic reconnection sync

### Version 3.0 (Planned)
- Advanced staff roles with PIN authentication
- Weekly and monthly reporting
- Item popularity trends
- Multi-location support

### Version 4.0 (Planned)
- Recipe costing
- Supplier integration
- Purchase order management
- Advanced inventory with auto-deduction

---

## Contributing

This is a production system. Future contributions should focus on:
- Offline-first capabilities with IndexedDB
- ESC/POS printer integration
- Enhanced reporting features
- Mobile application (React Native)

Please follow the established architecture patterns and maintain security standards.

---

## License

Internal use. Refer to organizational licensing policy.

---

## Technical Support

For technical assistance:
1. Review troubleshooting section
2. Consult API documentation
3. Inspect browser console (frontend issues)
4. Review backend logs (API issues)

---

## Acknowledgments

**Built with industry-leading technologies:**
- FastAPI - Modern, high-performance Python web framework
- React 19 - Latest frontend library
- MongoDB - Flexible NoSQL database
- Radix UI - Accessible component primitives
- Tailwind CSS - Utility-first CSS framework
- Lucide Icons - Beautiful icon library
- Sonner - Toast notifications
- date-fns - Date manipulation utility

**Architectural inspiration from enterprise POS systems with enhanced security and modern development practices.**

---

## Contact

For enterprise inquiries, custom development, or support contracts, please contact the development team.

---

**Version 1.0** | **Last Updated:** January 2026 | **Status:** Production Ready
