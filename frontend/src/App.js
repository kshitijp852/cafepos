import React, { useState, useEffect } from 'react';
import { Header } from '@/components/pos/Header';
import { DashboardView } from '@/components/pos/dashboard/DashboardView';
import { OrderView } from '@/components/pos/order/OrderView';
import { TableView } from '@/components/pos/tables/TableView';
import { ReservationView } from '@/components/pos/reservation/ReservationView';
import { HistoryView } from '@/components/pos/history/HistoryView';
import { InventoryView } from '@/components/pos/inventory/InventoryView';
import { AuthPage } from '@/pages/AuthPage';
import { getUser, clearAuth } from '@/utils/storage';
import { Toaster } from '@/components/ui/sonner';

function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    // Check if user is logged in
    const savedUser = getUser();
    if (savedUser) {
      setUser(savedUser);
    }
  }, []);

  const handleAuthSuccess = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    clearAuth();
    setUser(null);
    setActiveTab('dashboard');
  };

  // If not logged in, show auth page
  if (!user) {
    return (
      <>
        <AuthPage onAuthSuccess={handleAuthSuccess} />
        <Toaster position="top-right" />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="pos-app">
      <Header 
        user={user} 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        onLogout={handleLogout}
      />
      
      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'dashboard' && <DashboardView cafeId={user.cafe_id} />}
        {activeTab === 'order' && <OrderView cafeId={user.cafe_id} />}
        {activeTab === 'table' && <TableView cafeId={user.cafe_id} />}
        {activeTab === 'reservation' && <ReservationView cafeId={user.cafe_id} />}
        {activeTab === 'history' && <HistoryView cafeId={user.cafe_id} />}
        {activeTab === 'inventory' && <InventoryView cafeId={user.cafe_id} />}
      </main>

      <Toaster position="top-right" />
    </div>
  );
}

export default App;
