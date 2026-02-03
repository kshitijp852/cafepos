# Cafe POS System

A complete Point of Sale (POS) system designed for cafes and restaurants with dual interfaces for management and waitstaff.

## 🚀 Features

### Master Interface (Management)
- **Dashboard**: Real-time table overview and restaurant status
- **Live Order Monitor**: Track orders from pending to completion
- **Menu Management**: Categories, items, pricing, and availability
- **Table Management**: Floor plans and table configurations
- **Staff Management**: Waiter accounts and device authentication
- **Inventory Management**: Stock tracking with low-stock alerts
- **Reservation System**: Table booking and customer management
- **Order History**: Complete billing and transaction history
- **Reporting**: Sales analytics and performance metrics

### Waiter Interface (Mobile-Optimized)
- **Device Authentication**: Secure device-based login system
- **Table Selection**: Visual table layout and status
- **Order Taking**: Menu browsing with cart management
- **Real-time Updates**: Live order status and kitchen communication
- **Offline Capability**: Basic functionality without internet

## 🛠 Tech Stack

### Frontend
- **React 18.3.1** - Modern React with hooks
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - High-quality component library (Radix UI)
- **Lucide React** - Beautiful icons
- **React Router DOM** - Client-side routing
- **Axios** - HTTP client for API calls
- **React Hook Form** - Form handling with validation
- **Sonner** - Toast notifications
- **date-fns** - Date manipulation

### Backend
- **FastAPI** - Modern Python web framework
- **MongoDB** - NoSQL database with Motor async driver
- **JWT Authentication** - Secure token-based auth
- **Pydantic** - Data validation and serialization
- **Uvicorn** - ASGI server
- **bcrypt** - Password hashing

### Development Tools
- **CRACO** - Create React App configuration override
- **ESLint** - Code linting
- **Prettier** - Code formatting

## 📁 Project Structure

```
cafe-pos/
├── frontend/                 # React application
│   ├── public/              # Static assets
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/          # Reusable UI components
│   │   │   └── pos/         # POS-specific components
│   │   │       ├── dashboard/    # Management dashboard
│   │   │       ├── waiter/       # Waiter interface
│   │   │       ├── master/       # Management features
│   │   │       ├── order/        # Order management
│   │   │       ├── inventory/    # Stock management
│   │   │       ├── reservation/  # Reservations
│   │   │       └── history/      # Order history
│   │   ├── utils/           # API calls & utilities
│   │   └── lib/             # Helper functions
│   ├── package.json         # Dependencies
│   └── craco.config.js      # Build configuration
├── backend/                 # FastAPI server
│   ├── server.py           # Main application
│   ├── requirements.txt    # Python dependencies
│   ├── setup_sample_data.py # Database seeding
│   └── venv/               # Virtual environment
└── README.md               # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- Python 3.8+
- MongoDB 4.4+

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/cafe-pos-system.git
cd cafe-pos-system
```

### 2. Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your MongoDB connection string

# Start the server
python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your backend URL

# Start development server
npm start
```

### 4. Access the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8001
- **API Documentation**: http://localhost:8001/docs

## 🔐 Demo Credentials

For testing purposes, use these demo credentials:

- **Email**: admin@demo.com
- **Password**: demo123
- **Role**: Owner/Manager

## 📱 Usage

### Master Interface
1. Login with admin credentials
2. Navigate through different sections using the header tabs
3. Manage menu items, tables, and staff
4. Monitor live orders and process billing

### Waiter Interface
1. Access via `?role=waiter` URL parameter
2. Complete device authentication (one-time setup)
3. Select tables and take orders
4. Submit orders to kitchen

## 🔧 Configuration

### Environment Variables

#### Frontend (.env)
```env
REACT_APP_BACKEND_URL=http://localhost:8001
WDS_SOCKET_PORT=3000
ENABLE_HEALTH_CHECK=false
```

#### Backend (.env)
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=cafe_pos_db
CORS_ORIGINS=*
```

## 🗄 Database Schema

### Core Collections
- **users** - Authentication and user management
- **cafes** - Restaurant information
- **categories** - Menu organization
- **menu_items** - Products and pricing
- **tables** - Seating arrangements
- **floors** - Restaurant layout
- **orders** - Customer orders
- **bills** - Payment records
- **reservations** - Table bookings
- **inventory** - Stock management

## 🔄 Order Flow

1. **Waiter** takes order on mobile device
2. **Kitchen** receives order notification
3. **Staff** updates order status (preparing → ready)
4. **Manager** processes billing and payment
5. **System** records transaction history

## 🧪 Testing

### Demo User Creation
```bash
# Run the demo user script
python create_demo_user.py
```

### Sample Data Setup
```bash
# Populate with sample menu and tables
python setup_sample_data.py
```

## 🚀 Deployment

### Frontend (Netlify/Vercel)
```bash
npm run build
# Deploy the build/ directory
```

### Backend (Heroku/Railway)
```bash
# Ensure requirements.txt is up to date
pip freeze > requirements.txt

# Deploy with your preferred platform
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🐛 Known Issues

- ESLint warnings for useEffect dependencies
- No WebSocket implementation (uses polling)
- Limited offline functionality
- Basic error handling

## 🔮 Future Enhancements

- [ ] WebSocket integration for real-time updates
- [ ] Advanced reporting and analytics
- [ ] Multi-location support
- [ ] Integration with payment gateways
- [ ] Mobile app development
- [ ] Advanced inventory management
- [ ] Customer loyalty program
- [ ] Kitchen display system

## 📞 Support

For support and questions, please open an issue in the GitHub repository.

---

**Built with ❤️ for the restaurant industry**