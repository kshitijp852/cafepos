import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { 
  Users, 
  Clock, 
  CheckCircle,
  Receipt,
  Plus,
  Minus,
  ShoppingCart
} from 'lucide-react';
import { 
  getFloors, 
  getTables, 
  getOrders,
  getMenuItems,
  getCategories,
  createOrder,
  createBill,
  updateTable
} from '@/utils/api';
import { toast } from 'sonner';

export const TableDashboard = ({ cafeId }) => {
  console.log('TableDashboard rendered with cafeId:', cafeId);
  
  const [floors, setFloors] = useState([]);
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
    
    // Refresh data every 10 seconds for real-time updates
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [cafeId]);

  const loadData = async () => {
    try {
      console.log('Loading data for cafe:', cafeId);
      setError(null);
      const [floorsData, tablesData, ordersData, menuData, categoriesData] = await Promise.all([
        getFloors(cafeId),
        getTables(cafeId),
        getOrders(cafeId, 'active'),
        getMenuItems(cafeId),
        getCategories(cafeId)
      ]);
      
      console.log('Loaded floors:', floorsData);
      console.log('Loaded tables:', tablesData);
      console.log('Loaded menu items:', menuData);
      console.log('Loaded categories:', categoriesData);
      
      setFloors(floorsData);
      setTables(tablesData);
      setOrders(ordersData);
      setMenuItems(menuData.filter(item => item.available));
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error loading data:', error);
      setError(error.message);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const getTableStatus = (table) => {
    const tableOrder = orders.find(order => order.table_id === table.id);
    
    console.log(`Table ${table.name} status check:`, { 
      tableId: table.id, 
      hasOrder: !!tableOrder, 
      orderStatus: tableOrder?.status,
      orderItems: tableOrder?.items?.length || 0
    });
    
    if (!tableOrder) return 'available';
    
    switch (tableOrder.status) {
      case 'pending':
      case 'preparing': 
        return 'occupied';
      case 'ready':
        return 'ready';
      case 'completed':
        return 'billing';
      default:
        return 'available';
    }
  };

  const getTableStatusColor = (status) => {
    switch (status) {
      case 'available': return 'bg-gray-200 border-gray-300 text-gray-700 hover:bg-gray-300';
      case 'occupied': return 'bg-orange-200 border-orange-400 text-orange-800 hover:bg-orange-300';
      case 'ready': return 'bg-blue-200 border-blue-400 text-blue-800 hover:bg-blue-300';
      case 'billing': return 'bg-green-200 border-green-400 text-green-800 hover:bg-green-300';
      default: return 'bg-gray-200 border-gray-300 text-gray-700';
    }
  };

  const getTableStatusIcon = (status) => {
    switch (status) {
      case 'occupied': return <Clock className="w-4 h-4" />;
      case 'ready': return <CheckCircle className="w-4 h-4" />;
      case 'billing': return <Receipt className="w-4 h-4" />;
      default: return <Users className="w-4 h-4" />;
    }
  };

  const getTableStatusText = (status) => {
    switch (status) {
      case 'available': return 'Available';
      case 'occupied': return 'Ordering';
      case 'ready': return 'Ready';
      case 'billing': return 'Billing';
      default: return 'Available';
    }
  };

  const handleTableClick = (table) => {
    try {
      console.log('Table clicked:', table);
      const status = getTableStatus(table);
      console.log('Table status:', status);
      
      setSelectedTable(table);
      
      if (status === 'available') {
        // Start new order - empty cart
        console.log('Starting new order for available table');
        setCart([]);
      } else {
        // Show existing order
        const tableOrder = orders.find(order => order.table_id === table.id);
        console.log('Found table order:', tableOrder);
        
        if (tableOrder && tableOrder.items && tableOrder.items.length > 0) {
          // Convert order items to cart format
          const cartItems = tableOrder.items.map(item => ({
            menu_item_id: item.menu_item_id || item.id,
            menu_item_name: item.menu_item_name || item.name,
            quantity: item.quantity || 1,
            price: item.price,
            notes: item.notes || ''
          }));
          console.log('Setting cart items from existing order:', cartItems);
          setCart(cartItems);
        } else {
          console.log('No existing order items found, starting with empty cart');
          setCart([]);
        }
      }
      
      setShowOrderDialog(true);
    } catch (error) {
      console.error('Error in handleTableClick:', error);
      toast.error('Error opening table order');
    }
  };

  const addToCart = (item) => {
    const existingItem = cart.find(cartItem => cartItem.menu_item_id === item.id);
    
    if (existingItem) {
      setCart(cart.map(cartItem =>
        cartItem.menu_item_id === item.id
          ? { ...cartItem, quantity: cartItem.quantity + 1 }
          : cartItem
      ));
    } else {
      setCart([...cart, {
        menu_item_id: item.id,
        menu_item_name: item.name,
        quantity: 1,
        price: item.price,
        notes: ''
      }]);
    }
  };

  const updateCartItemQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      setCart(cart.filter(item => item.menu_item_id !== itemId));
      return;
    }

    setCart(cart.map(item =>
      item.menu_item_id === itemId
        ? { ...item, quantity: newQuantity }
        : item
    ));
  };

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const calculateOrderTotal = (order) => {
    if (!order || !order.items) return 0;
    return order.items.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const handleSaveOrder = async () => {
    if (cart.length === 0) {
      toast.error('Please add items to the order');
      return;
    }

    const status = getTableStatus(selectedTable);
    
    try {
      if (status === 'available') {
        // Create new order
        const orderData = {
          cafe_id: cafeId,
          table_id: selectedTable.id,
          items: cart,
          status: 'pending'
        };

        const newOrder = await createOrder(orderData);
        console.log('New order created:', newOrder);
        
        toast.success(`Order created for ${selectedTable.name}`);
      } else {
        // Update existing order - for now we'll create a new order
        // In a real system, you'd update the existing order
        const orderData = {
          cafe_id: cafeId,
          table_id: selectedTable.id,
          items: cart,
          status: 'pending'
        };

        await createOrder(orderData);
        toast.success(`Order updated for ${selectedTable.name}`);
      }
      
      setShowOrderDialog(false);
      setSelectedTable(null);
      setCart([]);
      loadData(); // Refresh data to show updated table status
    } catch (error) {
      console.error('Error saving order:', error);
      toast.error('Failed to save order');
    }
  };

  const handleProceedToBilling = async () => {
    if (cart.length === 0) {
      toast.error('No items to bill');
      return;
    }

    try {
      const tableOrder = orders.find(order => order.table_id === selectedTable.id);
      const subtotal = calculateTotal();
      const taxPercentage = 5; // 5% GST
      const tax = subtotal * (taxPercentage / 100);
      const total = subtotal + tax;

      const billData = {
        cafe_id: cafeId,
        table_id: selectedTable.id,
        items: cart,
        tax_percentage: taxPercentage,
        payment_method: 'cash', // Default to cash
        order_id: tableOrder?.id
      };

      await createBill(billData);
      
      // Update table status back to available
      await updateTable(selectedTable.id, { 
        status: 'available',
        current_order_id: null
      });
      
      toast.success(`Bill created for ${selectedTable.name} - Total: ₹${total.toFixed(2)}`);
      setShowOrderDialog(false);
      setSelectedTable(null);
      setCart([]);
      loadData(); // Refresh data
    } catch (error) {
      console.error('Error creating bill:', error);
      toast.error('Failed to create bill');
    }
  };

  const getFilteredMenuItems = () => {
    let filtered = menuItems;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.category_id === selectedCategory);
    }

    // Filter by search term
    if (searchTerm.trim()) {
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filtered;
  };

  const getTablesByFloor = (floorId) => {
    return tables.filter(table => table.floor_id === floorId);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error: {error}</p>
          <p className="text-sm text-gray-500">Cafe ID: {cafeId}</p>
          <Button onClick={loadData} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    console.log('TableDashboard: Still loading...');
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading tables...</p>
          <p className="text-sm text-gray-500">Cafe ID: {cafeId}</p>
        </div>
      </div>
    );
  }

  console.log('TableDashboard render state:', { 
    floors: floors.length, 
    tables: tables.length, 
    loading, 
    error 
  });

  if (floors.length === 0) {
    console.log('TableDashboard: No floors found');
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-gray-600 mb-4">No floors found. Check console for details.</p>
          <p className="text-sm text-gray-500">Cafe ID: {cafeId}</p>
          <Button onClick={loadData} className="mt-4">
            Retry Loading Data
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 h-full bg-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-5xl font-bold text-gray-900">Table Dashboard</h2>
          <p className="text-2xl text-gray-600 mt-2">Click tables to take orders and manage service</p>
        </div>
        
        {/* Status Legend */}
        <div className="flex items-center space-x-8 text-xl">
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-gray-200 border-2 border-gray-400 rounded shadow-sm"></div>
            <span className="font-medium">Available</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-orange-200 border-2 border-orange-500 rounded shadow-sm"></div>
            <span className="font-medium">Ordering</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-blue-200 border-2 border-blue-500 rounded shadow-sm"></div>
            <span className="font-medium">Ready</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-green-200 border-2 border-green-500 rounded shadow-sm"></div>
            <span className="font-medium">Billing</span>
          </div>
        </div>
      </div>

      {/* Tables by Floor */}
      <div className="space-y-6">
        {floors.map(floor => {
          const floorTables = getTablesByFloor(floor.id);
          
          if (floorTables.length === 0) return null;

          return (
            <div key={floor.id}>
              <h3 className="text-3xl font-semibold text-gray-800 mb-4 flex items-center">
                <Badge variant="secondary" className="mr-6 text-xl px-6 py-3">
                  {floor.name}
                </Badge>
                <span className="text-xl text-gray-500">
                  {floorTables.length} tables
                </span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {floorTables.map(table => {
                  const status = getTableStatus(table);
                  const tableOrder = orders.find(order => order.table_id === table.id);
                  
                  console.log(`Table ${table.name}:`, { status, hasOrder: !!tableOrder, order: tableOrder });
                  
                  return (
                    <Card
                      key={table.id}
                      onClick={() => handleTableClick(table)}
                      className={`
                        relative cursor-pointer transition-all duration-200 transform hover:scale-105
                        border-3 min-h-[200px] flex flex-col justify-between shadow-xl hover:shadow-2xl
                        ${getTableStatusColor(status)} bg-white
                      `}
                      style={{
                        borderColor: status === 'available' ? '#d1d5db' : 
                                   status === 'occupied' ? '#f97316' : 
                                   status === 'ready' ? '#3b82f6' : 
                                   status === 'billing' ? '#10b981' : '#d1d5db',
                        borderWidth: '3px'
                      }}
                    >
                      <CardContent className="p-8">
                        {/* Table Number */}
                        <div className="text-center">
                          <div className="text-3xl font-bold mb-3">
                            {table.name}
                          </div>
                          <div className="text-lg opacity-75 mb-4">
                            {table.capacity} seats
                          </div>
                        </div>

                        {/* Status */}
                        <div className="text-center">
                          <div className="flex items-center justify-center space-x-3 mb-3">
                            {getTableStatusIcon(status)}
                            <span className="text-lg font-medium">
                              {getTableStatusText(status)}
                            </span>
                          </div>
                          
                          {/* Order Info */}
                          {tableOrder && (
                            <div className="text-lg opacity-75">
                              <div className="font-medium">
                                ₹{tableOrder.total?.toFixed(2) || calculateOrderTotal(tableOrder).toFixed(2)}
                              </div>
                              <div className="text-base">
                                {tableOrder.items?.length || 0} items
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Action Indicator */}
                        {status === 'ready' && (
                          <div className="absolute -top-2 -right-2">
                            <div className="bg-blue-600 text-white rounded-full p-3">
                              <Receipt className="w-6 h-6" />
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Order Dialog */}
      <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
        <DialogContent className="max-w-[98vw] max-h-[98vh] overflow-hidden p-4 bg-gray-100">
          <DialogHeader>
            <DialogTitle className="text-3xl">
              {selectedTable ? (
                <div className="flex items-center space-x-4">
                  <span>Order for {selectedTable.name}</span>
                  <Badge 
                    variant={getTableStatus(selectedTable) === 'available' ? 'secondary' : 'default'}
                    className="text-xl px-4 py-2 shadow-md"
                  >
                    {getTableStatusText(getTableStatus(selectedTable))}
                  </Badge>
                </div>
              ) : 'Order'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex h-[85vh] space-x-4">
            {/* Left Sidebar - Categories (12% width) */}
            <div className="w-[12%] space-y-2 bg-white p-4 rounded-lg shadow-lg">
              <h3 className="text-xl font-semibold mb-4">Categories</h3>
              <Button
                variant={selectedCategory === 'all' ? 'default' : 'outline'}
                onClick={() => setSelectedCategory('all')}
                className="w-full justify-start h-14 text-lg shadow-md hover:shadow-lg"
              >
                All Items
              </Button>
              {categories.map(category => (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? 'default' : 'outline'}
                  onClick={() => setSelectedCategory(category.id)}
                  className="w-full justify-start h-14 text-lg shadow-md hover:shadow-lg"
                >
                  {category.name}
                </Button>
              ))}
            </div>

            {/* Main Content Area - Menu Items (50% width) */}
            <div className="w-1/2 space-y-4 bg-white p-4 rounded-lg shadow-lg">
              {/* Search Bar */}
              <div className="flex space-x-4">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Search menu items..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Menu Items Grid - Bigger and more square */}
              <div className="overflow-y-auto h-full">
                <div className="grid grid-cols-3 gap-4">
                  {getFilteredMenuItems().map(item => (
                    <Card
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className="cursor-pointer hover:shadow-xl transition-all duration-200 relative h-40 bg-white shadow-lg transform hover:scale-105"
                    >
                      {/* Veg/Non-Veg Tag */}
                      <div className="absolute top-3 right-3 z-10">
                        <div className={`w-6 h-6 border-2 flex items-center justify-center shadow-sm ${
                          item.is_veg !== false ? 'border-green-500' : 'border-red-500'
                        }`}>
                          <div className={`w-4 h-4 rounded-full ${
                            item.is_veg !== false ? 'bg-green-500' : 'bg-red-500'
                          }`}></div>
                        </div>
                      </div>
                      
                      <CardContent className="p-6 pt-10 h-full flex flex-col justify-center">
                        <div className="text-center">
                          <h4 className="font-semibold text-lg mb-3 line-clamp-2">{item.name}</h4>
                          <p className="text-base text-gray-600 mb-4 line-clamp-1">{item.description}</p>
                          <Badge variant="secondary" className="text-lg px-4 py-2 shadow-md">
                            ₹{item.price}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>

            <Separator orientation="vertical" />

            {/* Right Sidebar - Order Summary (38% width - bigger) */}
            <div className="w-[38%] space-y-4">
              <Card className="h-full flex flex-col bg-white shadow-xl">
                <CardHeader className="pb-3 bg-gray-50 rounded-t-lg">
                  <CardTitle className="flex items-center justify-between text-2xl">
                    <span>CHECK ITEMS</span>
                    <div className="flex space-x-8 text-base font-medium text-gray-600">
                      <span>QTY</span>
                      <span>PRICE</span>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto space-y-2 bg-gray-50">
                  {cart.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <ShoppingCart className="w-16 h-16 mx-auto mb-6 opacity-50" />
                      <p className="text-lg">No items added</p>
                      <p className="text-base">Click menu items to add</p>
                    </div>
                  ) : (
                    cart.map(item => (
                      <Card key={item.menu_item_id} className="p-3 bg-white shadow-md hover:shadow-lg transition-shadow">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2 flex-1">
                            <div className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0"></div>
                            <span className="font-medium text-base leading-tight flex-1">{item.menu_item_name}</span>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateCartItemQuantity(item.menu_item_id, item.quantity - 1)}
                              className="h-7 w-7 p-0 shadow-sm hover:shadow-md"
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateCartItemQuantity(item.menu_item_id, item.quantity + 1)}
                              className="h-7 w-7 p-0 shadow-sm hover:shadow-md"
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          
                          <Badge variant="secondary" className="text-sm px-2 py-1 shadow-sm ml-2">
                            ₹{(item.price * item.quantity).toFixed(2)}
                          </Badge>
                        </div>
                        
                        <div className="text-xs text-gray-500 mt-1 ml-5">₹{item.price} each</div>
                      </Card>
                    ))
                  )}
                </CardContent>

                {/* Order Summary Footer - Much bigger */}
                <div className="border-t p-8 space-y-8 bg-white">
                  {/* Special Options */}
                  <div className="flex flex-wrap gap-4">
                    <Button size="lg" className="bg-red-500 hover:bg-red-600 text-lg px-6 py-3 shadow-lg hover:shadow-xl">Bogo Offer</Button>
                    <Button size="lg" variant="outline" className="text-lg px-6 py-3 shadow-md hover:shadow-lg">Split</Button>
                    <label className="flex items-center text-lg">
                      <input type="checkbox" className="mr-3 w-5 h-5" />
                      <span>Complimentary</span>
                    </label>
                  </div>

                  {/* Total - Much bigger */}
                  <div className="flex justify-between items-center text-4xl font-bold py-6 border-t border-b bg-gray-50 px-6 rounded-lg shadow-inner">
                    <span>Total</span>
                    <span className="text-green-600">₹{calculateTotal().toFixed(2)}</span>
                  </div>

                  {/* Payment Options - Bigger buttons */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <Button size="lg" variant="outline" className="text-lg py-4 shadow-md hover:shadow-lg">Cash</Button>
                    <Button size="lg" variant="outline" className="text-lg py-4 shadow-md hover:shadow-lg">Card</Button>
                    <Button size="lg" variant="outline" className="text-lg py-4 shadow-md hover:shadow-lg">Due</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <Button size="lg" variant="outline" className="text-lg py-4 shadow-md hover:shadow-lg">Other</Button>
                    <Button size="lg" variant="outline" className="text-lg py-4 shadow-md hover:shadow-lg">Part</Button>
                  </div>

                  {/* Additional Options */}
                  <div className="flex flex-wrap gap-8 text-lg">
                    <label className="flex items-center">
                      <input type="checkbox" className="mr-3 w-5 h-5" />
                      <span>It's Paid</span>
                    </label>
                    <label className="flex items-center">
                      <input type="checkbox" className="mr-3 w-5 h-5" />
                      <span>Loyalty</span>
                    </label>
                    <label className="flex items-center">
                      <input type="checkbox" className="mr-3 w-5 h-5" />
                      <span>Send SMS</span>
                    </label>
                  </div>

                  {/* Action Buttons - Much bigger */}
                  <div className="grid grid-cols-2 gap-4">
                    <Button 
                      onClick={handleSaveOrder}
                      className="bg-red-500 hover:bg-red-600 py-6 text-xl shadow-lg hover:shadow-xl"
                      size="lg"
                    >
                      <CheckCircle className="w-6 h-6 mr-3" />
                      Save
                    </Button>
                    <Button variant="outline" className="py-6 text-xl shadow-md hover:shadow-lg" size="lg">
                      Save & Print
                    </Button>
                    <Button 
                      onClick={handleProceedToBilling}
                      className="bg-green-500 hover:bg-green-600 py-6 text-xl shadow-lg hover:shadow-xl"
                      size="lg"
                    >
                      <Receipt className="w-6 h-6 mr-3" />
                      Save & eBill
                    </Button>
                    <Button variant="outline" className="py-6 text-xl shadow-md hover:shadow-lg" size="lg">
                      KOT
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};