import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Clock, AlertCircle } from 'lucide-react';
import { getFloors, getTables } from '@/utils/api';
import { toast } from 'sonner';

export const TableSelection = ({ cafeId, onTableSelect }) => {
  const [floors, setFloors] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTablesData();
  }, [cafeId]);

  const loadTablesData = async () => {
    try {
      setLoading(true);
      const [floorsData, tablesData] = await Promise.all([
        getFloors(cafeId),
        getTables(cafeId)
      ]);
      
      setFloors(floorsData);
      setTables(tablesData);
    } catch (error) {
      console.error('Error loading tables:', error);
      toast.error('Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  const getTablesByFloor = (floorId) => {
    return tables.filter(table => table.floor_id === floorId);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800 border-green-200';
      case 'occupied': return 'bg-red-100 text-red-800 border-red-200';
      case 'reserved': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'occupied': return <AlertCircle className="w-4 h-4" />;
      case 'reserved': return <Clock className="w-4 h-4" />;
      default: return <Users className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading tables...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Table</h2>
          <p className="text-gray-600">Choose a table to start taking orders</p>
        </div>

        <div className="space-y-8">
          {floors.map(floor => {
            const floorTables = getTablesByFloor(floor.id);
            
            if (floorTables.length === 0) return null;

            return (
              <div key={floor.id}>
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm mr-3">
                    {floor.name}
                  </span>
                  <span className="text-sm text-gray-500">
                    {floorTables.length} tables
                  </span>
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {floorTables.map(table => (
                    <Card 
                      key={table.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        table.status === 'available' 
                          ? 'hover:border-blue-300 hover:bg-blue-50' 
                          : 'opacity-75'
                      }`}
                      onClick={() => table.status === 'available' && onTableSelect(table)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg font-semibold">
                            {table.name}
                          </CardTitle>
                          {getStatusIcon(table.status)}
                        </div>
                      </CardHeader>
                      
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <div className="flex items-center text-sm text-gray-600">
                            <Users className="w-3 h-3 mr-1" />
                            <span>Seats: {table.capacity}</span>
                          </div>
                          
                          <Badge 
                            className={`w-full justify-center ${getStatusColor(table.status)}`}
                          >
                            {table.status.charAt(0).toUpperCase() + table.status.slice(1)}
                          </Badge>

                          {table.status === 'available' && (
                            <Button 
                              size="sm" 
                              className="w-full mt-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTableSelect(table);
                              }}
                            >
                              Take Order
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {floors.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No tables found</h3>
            <p className="text-gray-600">Ask your manager to set up tables first.</p>
          </div>
        )}
      </div>
    </div>
  );
};