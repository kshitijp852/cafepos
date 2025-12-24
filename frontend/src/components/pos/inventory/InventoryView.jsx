import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { getInventory, createInventoryItem, updateInventoryItem } from '@/utils/api';
import { Package, Plus, AlertTriangle, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export const InventoryView = ({ cafeId }) => {
  const [inventory, setInventory] = useState([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    unit: '',
    current_stock: '',
    min_stock: '',
    max_stock: '',
    cost_per_unit: ''
  });

  useEffect(() => {
    loadInventory();
  }, [cafeId]);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const data = await getInventory(cafeId);
      setInventory(data);
    } catch (error) {
      console.error('Error loading inventory:', error);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const data = {
        ...formData,
        cafe_id: cafeId,
        current_stock: parseFloat(formData.current_stock),
        min_stock: parseFloat(formData.min_stock),
        max_stock: parseFloat(formData.max_stock),
        cost_per_unit: parseFloat(formData.cost_per_unit)
      };
      await createInventoryItem(data);
      toast.success('Inventory item added');
      setShowAddDialog(false);
      setFormData({
        name: '',
        unit: '',
        current_stock: '',
        min_stock: '',
        max_stock: '',
        cost_per_unit: ''
      });
      loadInventory();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add item');
    }
  };

  const handleRestock = async (itemId, currentStock) => {
    const newStock = prompt(`Enter new stock quantity (current: ${currentStock}):`);
    if (newStock && !isNaN(newStock)) {
      try {
        await updateInventoryItem(itemId, { 
          current_stock: parseFloat(newStock),
          last_restocked: new Date().toISOString()
        });
        toast.success('Stock updated');
        loadInventory();
      } catch (error) {
        toast.error('Failed to update stock');
      }
    }
  };

  const getStockStatus = (item) => {
    if (item.current_stock <= item.min_stock) {
      return { status: 'low', color: 'red', label: 'Low Stock' };
    } else if (item.current_stock >= item.max_stock) {
      return { status: 'high', color: 'blue', label: 'Overstocked' };
    } else {
      return { status: 'normal', color: 'green', label: 'Normal' };
    }
  };

  const lowStockItems = inventory.filter(item => item.current_stock <= item.min_stock);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading inventory...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 bg-gray-50 overflow-auto" data-testid="inventory-view">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Inventory Management</h2>
        <Button onClick={() => setShowAddDialog(true)} data-testid="add-inventory-button">
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="mb-6 border-red-200 bg-red-50" data-testid="low-stock-alert">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-900">Low Stock Alert</h3>
                <p className="text-sm text-red-700">
                  {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} need restocking
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory Grid */}
      {inventory.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No inventory items</p>
          <Button 
            className="mt-4" 
            variant="outline" 
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add First Item
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {inventory.map(item => {
            const stockStatus = getStockStatus(item);
            return (
              <Card key={item.id} data-testid={`inventory-item-${item.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{item.name}</CardTitle>
                      <p className="text-sm text-gray-600">{item.unit}</p>
                    </div>
                    <Badge 
                      variant={stockStatus.status === 'low' ? 'destructive' : 'secondary'}
                    >
                      {stockStatus.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Current Stock:</span>
                      <span className="font-bold text-lg">{item.current_stock} {item.unit}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Min:</span>
                      <span>{item.min_stock}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Max:</span>
                      <span>{item.max_stock}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Cost per unit:</span>
                      <span>₹{item.cost_per_unit.toFixed(2)}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => handleRestock(item.id, item.current_stock)}
                      data-testid={`restock-${item.id}`}
                    >
                      <TrendingUp className="w-4 h-4 mr-2" />
                      Update Stock
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Item Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent data-testid="add-inventory-dialog">
          <DialogHeader>
            <DialogTitle>Add Inventory Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="item-name">Item Name *</Label>
              <Input
                id="item-name"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g., Coffee Beans"
                data-testid="item-name-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="unit">Unit *</Label>
                <Input
                  id="unit"
                  value={formData.unit}
                  onChange={(e) => setFormData({...formData, unit: e.target.value})}
                  placeholder="kg, liters, pieces"
                  data-testid="unit-input"
                />
              </div>
              <div>
                <Label htmlFor="cost-per-unit">Cost per Unit (₹) *</Label>
                <Input
                  id="cost-per-unit"
                  type="number"
                  step="0.01"
                  value={formData.cost_per_unit}
                  onChange={(e) => setFormData({...formData, cost_per_unit: e.target.value})}
                  placeholder="0.00"
                  data-testid="cost-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="current-stock">Current Stock *</Label>
                <Input
                  id="current-stock"
                  type="number"
                  step="0.01"
                  value={formData.current_stock}
                  onChange={(e) => setFormData({...formData, current_stock: e.target.value})}
                  placeholder="0"
                  data-testid="current-stock-input"
                />
              </div>
              <div>
                <Label htmlFor="min-stock">Min Stock *</Label>
                <Input
                  id="min-stock"
                  type="number"
                  step="0.01"
                  value={formData.min_stock}
                  onChange={(e) => setFormData({...formData, min_stock: e.target.value})}
                  placeholder="0"
                  data-testid="min-stock-input"
                />
              </div>
              <div>
                <Label htmlFor="max-stock">Max Stock *</Label>
                <Input
                  id="max-stock"
                  type="number"
                  step="0.01"
                  value={formData.max_stock}
                  onChange={(e) => setFormData({...formData, max_stock: e.target.value})}
                  placeholder="0"
                  data-testid="max-stock-input"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.name || !formData.unit || !formData.current_stock || !formData.min_stock || !formData.max_stock || !formData.cost_per_unit}
              data-testid="confirm-add-inventory"
            >
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
