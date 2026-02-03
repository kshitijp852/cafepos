import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Users, Clock } from 'lucide-react';

export const WaiterHeader = ({ user, selectedTable, onBackToTables, showBackButton }) => {
  return (
    <header className="bg-blue-600 text-white border-b shadow-sm" data-testid="waiter-header">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {showBackButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBackToTables}
                className="text-white hover:bg-blue-700"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Tables
              </Button>
            )}
            
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-bold">
                Waiter Interface
              </h1>
              
              {selectedTable && (
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary" className="bg-white text-blue-600">
                    <Users className="w-3 h-3 mr-1" />
                    {selectedTable.name}
                  </Badge>
                  <Badge variant="outline" className="border-white text-white">
                    Capacity: {selectedTable.capacity}
                  </Badge>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm">
              <Clock className="w-4 h-4" />
              <span>{new Date().toLocaleTimeString()}</span>
            </div>
            
            <div className="text-right">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs opacity-90">Waiter</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};