import React, { useState, useEffect } from 'react';
import { Header } from '@/components/pos/Header';
import { DashboardView } from '@/components/pos/dashboard/DashboardView';
import { OrderView } from '@/components/pos/order/OrderView';
import { ReservationView } from '@/components/pos/reservation/ReservationView';
import { HistoryView } from '@/components/pos/history/HistoryView';
import { InventoryView } from '@/components/pos/inventory/InventoryView';
import { LiveOrderMonitor } from '@/components/pos/master/LiveOrderMonitor';
import { WaiterManagement } from '@/components/pos/master/WaiterManagement';
import { WaiterApp } from '@/components/pos/waiter/WaiterApp';
import { WaiterAuthPage } from '@/components/pos/waiter/WaiterAuthPage';
import { AuthPage } from '@/pages/AuthPage';
import { getUser, clearAuth } from '@/utils/storage';
import { Toaster } from '@/components/ui/sonner';

function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [userRole, setUserRole] = useState('master'); // 'master' or 'waiter'

  useEffect(() => {
    // Check if user is logged in
    const savedUser = getUser();
    if (savedUser) {
      setUser(savedUser);
      // Determine role based on URL or user role
      const urlParams = new URLSearchParams(window.location.search);
      const roleParam = urlParams.get('role');
      if (roleParam === 'waiter' || savedUser.role === 'waiter') {
        setUserRole('waiter');
      }
    }
  }, []);

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    // If it's a waiter, set role accordingly
    if (userData.role === 'waiter') {
      setUserRole('waiter');
    }
  };

  const handleLogout = () => {
    clearAuth();
    setUser(null);
    setActiveTab('dashboard');
    setUserRole('master');
  };

  const handleCreateBill = (order) => {
    // Switch to billing view with pre-filled order
    setActiveTab('order');
    // In a real implementation, you'd pass the order data to OrderView
  };

  // If not logged in, show appropriate auth page
  if (!user) {
    const urlParams = new URLSearchParams(window.location.search);
    const roleParam = urlParams.get('role');
    
    if (roleParam === 'waiter') {
      return (
        <>
          <WaiterAuthPage onAuthSuccess={handleAuthSuccess} />
          <Toaster position="top-right" />
        </>
      );
    }
    
    return (
      <>
        <AuthPage onAuthSuccess={handleAuthSuccess} />
        <Toaster position="top-right" />
      </>
    );
  }

  // Show waiter interface
  if (userRole === 'waiter' || user.role === 'waiter') {
    return <WaiterApp />;
  }

  // Show master interface
  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="pos-app">
      <Header 
        user={user} 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        onLogout={handleLogout}
        userRole={userRole}
        onRoleChange={setUserRole}
      />
      
      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'dashboard' && <DashboardView cafeId={user.cafe_id} />}
        {activeTab === 'order' && <OrderView cafeId={user.cafe_id} />}
        {activeTab === 'live-orders' && (
          <LiveOrderMonitor 
            cafeId={user.cafe_id} 
            onCreateBill={handleCreateBill}
          />
        )}
        {activeTab === 'staff' && (
          <WaiterManagement 
            cafeId={user.cafe_id}
            currentUser={user}
          />
        )}
        {activeTab === 'reservation' && <ReservationView cafeId={user.cafe_id} />}
        {activeTab === 'history' && <HistoryView cafeId={user.cafe_id} />}
        {activeTab === 'inventory' && <InventoryView cafeId={user.cafe_id} />}
      </main>

      <Toaster position="top-right" />
    </div>
  );
}

export default App;
