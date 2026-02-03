import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Users, 
  Calendar, 
  History, 
  Package,
  LogOut,
  Monitor,
  UserCheck
} from 'lucide-react';

export const Header = ({ user, activeTab, onTabChange, onLogout, userRole, onRoleChange }) => {
  const masterTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'live-orders', label: 'Live Orders', icon: Monitor },
    { id: 'order', label: 'New Order', icon: ShoppingCart },
    { id: 'staff', label: 'Staff', icon: UserCheck },
    { id: 'reservation', label: 'Reservations', icon: Calendar },
    { id: 'history', label: 'History', icon: History },
    { id: 'inventory', label: 'Inventory', icon: Package },
  ];

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm" data-testid="pos-header">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900" data-testid="app-title">
                Cafe POS
              </h1>
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                Master Interface
              </Badge>
            </div>
            
            <nav className="flex space-x-2">
              {masterTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Button
                    key={tab.id}
                    variant={activeTab === tab.id ? 'default' : 'ghost'}
                    onClick={() => onTabChange(tab.id)}
                    className="flex items-center space-x-2"
                    data-testid={`tab-${tab.id}`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </Button>
                );
              })}
            </nav>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Role Switch */}
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newUrl = new URL(window.location);
                  newUrl.searchParams.set('role', 'waiter');
                  window.location.href = newUrl.toString();
                }}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <UserCheck className="w-4 h-4 mr-2" />
                Switch to Waiter
              </Button>
            </div>
            
            <div className="text-right" data-testid="user-info">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500">Manager</p>
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onLogout}
              data-testid="logout-button"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
