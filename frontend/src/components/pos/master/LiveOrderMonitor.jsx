import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Clock, 
  Users, 
  ChefHat, 
  CheckCircle, 
  AlertCircle,
  DollarSign,
  Receipt
} from 'lucide-react';
import { getOrders, updateOrder, createBill } from '@/utils/api';
import { toast } from 'sonner';

export const LiveOrderMonitor = ({ cafeId, onCreateBill }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingOrders, setProcessingOrders] = useState(new Set());

  useEffect(() => {
    loadOrders();
    
    // Poll for new orders every 5 seconds
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [cafeId]);

  const loadOrders = async () => {
    try {
      const ordersData = await getOrders(cafeId, 'active');
      setOrders(ordersData.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    if (processingOrders.has(orderId)) return;

    try {
      setProcessingOrders(prev => new Set(prev).add(orderId));
      
      const order = orders.find(o => o.id === orderId);
      await updateOrder(orderId, {
        ...order,
        status: newStatus
      });

      setOrders(orders.map(order =>
        order.id === orderId
          ? { ...order, status: newStatus }
          : order
      ));

      toast.success(`Order ${newStatus === 'ready' ? 'marked as ready' : 'updated'}`);
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order');
    } finally {
      setProcessingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const proceedToBilling = (order) => {
    onCreateBill(order);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'preparing': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'ready': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'preparing': return <ChefHat className="w-4 h-4" />;
      case 'ready': return <CheckCircle className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getTimeElapsed = (createdAt) => {
    const now = new Date();
    const created = new Date(createdAt);
    const diffMinutes = Math.floor((now - created) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ${diffMinutes % 60}m ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Live Orders</h2>
          <Badge variant="outline" className="text-sm">
            {orders.length} active orders
          </Badge>
        </div>
        <p className="text-gray-600 mt-1">Monitor and manage orders from waiters</p>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12">
          <ChefHat className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No active orders</h3>
          <p className="text-gray-600">Orders from waiters will appear here in real-time</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {orders.map(order => (
            <Card key={order.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold">
                    Order #{order.id.slice(-6)}
                  </CardTitle>
                  <Badge className={getStatusColor(order.status)}>
                    {getStatusIcon(order.status)}
                    <span className="ml-1 capitalize">{order.status}</span>
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <div className="flex items-center">
                    <Users className="w-4 h-4 mr-1" />
                    <span>Table: {order.table_id || 'N/A'}</span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    <span>{getTimeElapsed(order.created_at)}</span>
                  </div>
                </div>

                {order.waiter_name && (
                  <div className="text-sm text-gray-600">
                    Waiter: <span className="font-medium">{order.waiter_name}</span>
                  </div>
                )}
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Order Items */}
                <div className="space-y-2">
                  {order.items.map((item, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                      <div className="flex-1">
                        <span className="font-medium">{item.menu_item_name}</span>
                        <span className="text-gray-600 ml-2">x{item.quantity}</span>
                        {item.notes && (
                          <div className="text-xs text-gray-500 mt-1 italic">
                            Note: {item.notes}
                          </div>
                        )}
                      </div>
                      <span className="font-medium">
                        ₹{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Order Total */}
                <div className="flex justify-between items-center font-semibold">
                  <span>Total:</span>
                  <span className="text-lg">₹{order.total.toFixed(2)}</span>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  {order.status === 'pending' && (
                    <Button
                      onClick={() => updateOrderStatus(order.id, 'preparing')}
                      disabled={processingOrders.has(order.id)}
                      className="w-full"
                      variant="outline"
                    >
                      <ChefHat className="w-4 h-4 mr-2" />
                      Start Preparing
                    </Button>
                  )}

                  {order.status === 'preparing' && (
                    <Button
                      onClick={() => updateOrderStatus(order.id, 'ready')}
                      disabled={processingOrders.has(order.id)}
                      className="w-full"
                      variant="outline"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Mark as Ready
                    </Button>
                  )}

                  {order.status === 'ready' && (
                    <Button
                      onClick={() => proceedToBilling(order)}
                      className="w-full"
                    >
                      <Receipt className="w-4 h-4 mr-2" />
                      Proceed to Billing
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};