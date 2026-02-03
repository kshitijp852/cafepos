import React from 'react';
import { TableDashboard } from './TableDashboard';

export const DashboardView = ({ cafeId }) => {
  console.log('DashboardView rendered with cafeId:', cafeId);
  
  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="bg-white border-b px-4 py-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Restaurant Tables</h1>
            <p className="text-gray-600 mt-1">Click tables to take orders and manage service</p>
          </div>
        </div>
      </div>

      {/* Main Table Dashboard */}
      <TableDashboard cafeId={cafeId} />
    </div>
  );
};