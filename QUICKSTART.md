# 🚀 Quick Start Guide - Cafe POS System

## 📌 **5-Minute Setup**

### **Step 1: Access the Application**
The application is already running! Open your browser and navigate to the frontend URL.

### **Step 2: Register Your Cafe**
1. Click the **"Register"** tab
2. Fill in:
   - **Cafe Name**: e.g., "Sunrise Cafe"
   - **Your Name**: e.g., "John Doe"
   - **Email**: your@email.com
   - **Password**: Choose a secure password
3. Click **"Create Account"**
4. You'll be automatically logged in

### **Step 3: Add Sample Data** (Recommended)
```bash
cd /app/backend
python setup_sample_data.py
```

This creates:
- ✅ 16 menu items across 4 categories
- ✅ 9 tables on 2 floors
- ✅ 5 inventory items

**OR manually add items through the UI**

### **Step 4: Open Day Session**
1. Go to **Dashboard** tab
2. Click **"Open Session"**
3. Enter opening cash (e.g., 1000)
4. Click **"Open Session"**

### **Step 5: Create Your First Order**
1. Click **"New Order"** tab
2. Browse menu items
3. Click **"Add"** on items you want
4. Adjust quantities using +/- buttons
5. Click **"Checkout"**
6. Select:
   - Tax percentage (default 5%)
   - Payment method (Cash/Card/UPI)
7. Click **"Complete & Print"**

### **Step 6: View Bill & Reports**
1. Go to **"History"** tab to see all bills
2. Click on a bill to view details
3. Go to **"Dashboard"** to see:
   - Total sales
   - Number of bills
   - Payment breakdown
   - Popular items

---

## 🎯 **Common Tasks**

### **Add a New Menu Item**
Currently done via sample data script. Future UI implementation will allow direct creation.

### **Manage Tables**
1. Go to **"Tables"** tab
2. View all tables by floor
3. See status: Available (green), Occupied (red), Reserved (yellow)

### **Create a Reservation**
1. Go to **"Reservations"** tab
2. Click **"New Reservation"**
3. Fill in customer details
4. Select date, time, table, and guest count
5. Click **"Create Reservation"**

### **Track Inventory**
1. Go to **"Inventory"** tab
2. View current stock levels
3. Click **"Update Stock"** to restock items
4. Low stock items show in red

### **Close Day Session**
1. Go to **"Dashboard"**
2. Click **"Close Session"**
3. Count physical cash
4. Enter the amount
5. System shows surplus/shortage
6. Click **"Close Session"**

---

## 🔧 **Service Management**

### **Check Service Status**
```bash
sudo supervisorctl status
```

### **Restart Services**
```bash
# Restart backend
sudo supervisorctl restart backend

# Restart frontend
sudo supervisorctl restart frontend

# Restart all
sudo supervisorctl restart all
```

### **View Logs**
```bash
# Backend logs
tail -f /var/log/supervisor/backend.err.log

# Frontend logs
tail -f /var/log/supervisor/frontend.out.log
```

---

## 💡 **Pro Tips**

### **Bill Security**
- Every bill has a SHA-256 hash
- Bills cannot be edited or deleted
- Perfect for tax audits and compliance

### **Daily Workflow**
1. **Morning**: Open day session
2. **During Day**: Take orders, process bills
3. **Evening**: Close session, review reports

### **Keyboard Shortcuts**
- Use tab navigation for faster data entry
- Enter key submits forms

### **Payment Methods**
- **Cash**: For cash payments (updates cash session)
- **Card**: For card payments
- **UPI**: For UPI/digital payments

---

## ❓ **Quick Troubleshooting**

### **Can't login?**
- Check email and password
- Ensure you registered successfully

### **Menu items not showing?**
- Run the sample data setup script
- Check backend logs for errors

### **Bills not creating?**
- Ensure day session is open
- Check backend API is running

### **Frontend not loading?**
- Check if frontend service is running
- Clear browser cache
- Check console for errors

---

## 📞 **Need Help?**

1. Check the full [README.md](./README.md)
2. View API documentation in README
3. Inspect browser console (F12)
4. Check backend logs

---

## 🎉 **You're All Set!**

Your cafe POS system is ready to use. Start by:
1. ✅ Opening a day session
2. ✅ Creating your first order
3. ✅ Exploring all features

**Happy selling! ☕🍕**
