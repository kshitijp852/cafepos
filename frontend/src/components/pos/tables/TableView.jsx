import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getTables, getFloors } from '@/utils/api';
import { Users, Clock } from 'lucide-react';
import { toast } from 'sonner';

export const TableView = ({ cafeId }) => {
  const [tables, setTables] = useState([]);
  const [floors, setFloors] = useState([]);
  const [selectedFloor, setSelectedFloor] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTables();
  }, [cafeId]);

  const loadTables = async () => {
    try {
      setLoading(true);
      const [tablesData, floorsData] = await Promise.all([
        getTables(cafeId),
        getFloors(cafeId)
      ]);
      setTables(tablesData);
      setFloors(floorsData);
    } catch (error) {
      console.error('Error loading tables:', error);
      toast.error('Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  const filteredTables = selectedFloor === 'all' 
    ? tables 
    : tables.filter(table => table.floor_id === selectedFloor);

  const getStatusColor = (status) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 border-green-300 hover:bg-green-200';
      case 'occupied':
        return 'bg-red-100 border-red-300 hover:bg-red-200';
      case 'reserved':
        return 'bg-yellow-100 border-yellow-300 hover:bg-yellow-200';
      default:
        return 'bg-gray-100 border-gray-300';
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      available: 'default',
      occupied: 'destructive',
      reserved: 'secondary'
    };
    return <Badge variant={variants[status] || 'default'}>{status.toUpperCase()}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading tables...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 bg-gray-50 overflow-auto" data-testid="table-view">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Table Management</h2>
        
        {/* Floor Filter */}
        <div className="flex space-x-2 mb-6 overflow-x-auto">
          <Button
            variant={selectedFloor === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedFloor('all')}
            data-testid="floor-all"
          >
            All Floors
          </Button>
          {floors.map(floor => (
            <Button
              key={floor.id}
              variant={selectedFloor === floor.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedFloor(floor.id)}
              data-testid={`floor-${floor.id}`}
            >
              {floor.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {filteredTables.map(table => (
          <Card 
            key={table.id} 
            className={`cursor-pointer transition-all ${getStatusColor(table.status)}`}
            data-testid={`table-${table.id}`}
          >
            <CardContent className="p-6 text-center">
              <div className="mb-3">
                {getStatusBadge(table.status)}
              </div>
              <h3 className="text-xl font-bold mb-2">{table.name}</h3>
              <div className="flex items-center justify-center text-sm text-gray-600">
                <Users className="w-4 h-4 mr-1" />
                <span>{table.capacity} seats</span>
              </div>
              {table.status === 'occupied' && table.current_order_id && (
                <div className="mt-3 flex items-center justify-center text-xs text-gray-500">
                  <Clock className="w-3 h-3 mr-1" />
                  <span>Active order</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredTables.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No tables found</p>
        </div>
      )}

      {/* Legend */}
      <div className="mt-8 p-4 bg-white rounded-lg shadow">
        <h3 className="font-semibold mb-3">Status Legend</h3>
        <div className="flex space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-200 border-2 border-green-300 rounded"></div>
            <span className="text-sm">Available</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-red-200 border-2 border-red-300 rounded"></div>
            <span className="text-sm">Occupied</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-yellow-200 border-2 border-yellow-300 rounded"></div>
            <span className="text-sm">Reserved</span>
          </div>
        </div>
      </div>
    </div>
  );
};
