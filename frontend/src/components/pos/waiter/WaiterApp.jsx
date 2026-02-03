import React, { useState, useEffect } from 'react';
import { WaiterHeader } from './WaiterHeader';
import { TableSelection } from './TableSelection';
import { WaiterOrderView } from './WaiterOrderView';
import { getUser } from '@/utils/storage';
import { Toaster } from '@/components/ui/sonner';

export const WaiterApp = () => {
  const [user, setUser] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [activeView, setActiveView] = useState('tables'); // 'tables' | 'order'

  useEffect(() => {
    const savedUser = getUser();
    if (savedUser) {
      setUser(savedUser);
    }
  }, []);

  const handleTableSelect = (table) => {
    setSelectedTable(table);
    setActiveView('order');
  };

  const handleBackToTables = () => {
    setSelectedTable(null);
    setActiveView('tables');
  };

  if (!user) {
    return <div>Please login first</div>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="waiter-app">
      <WaiterHeader 
        user={user}
        selectedTable={selectedTable}
        onBackToTables={handleBackToTables}
        showBackButton={activeView === 'order'}
      />
      
      <main className="flex-1 flex overflow-hidden">
        {activeView === 'tables' && (
          <TableSelection 
            cafeId={user.cafe_id}
            onTableSelect={handleTableSelect}
          />
        )}
        
        {activeView === 'order' && selectedTable && (
          <WaiterOrderView 
            cafeId={user.cafe_id}
            table={selectedTable}
            waiterId={user.id}
            waiterName={user.name}
          />
        )}
      </main>

      <Toaster position="top-right" />
    </div>
  );
};