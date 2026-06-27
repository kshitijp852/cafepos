import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Settings,
  Plus,
  Minus,
  ShoppingCart,
  AlertCircle,
  X,
  DollarSign,
  Trash2,
  Check,
  Upload,
  FileText
} from 'lucide-react';
import { 
  getOrders,
  getMenuItems,
  getCategories,
  createOrder,
  updateOrder,
  cancelOrder,
  createBill,
  createCategory,
  createMenuItem
} from '@/utils/api';
import { toast } from 'sonner';

export const TableDashboard = ({ cafeId }) => {
  // Table Configuration State
  const [numTables, setNumTables] = useState(8);
  const [showConfig, setShowConfig] = useState(false);
  const [tempTableCount, setTempTableCount] = useState(8);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvError, setCsvError] = useState('');

  // Data State
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // UI State
  const [selectedTable, setSelectedTable] = useState(null);
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load all data
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      const [ordersData, itemsData, categoriesData] = await Promise.all([
        getOrders('active'),
        getMenuItems(),
        getCategories()
      ]);
      
      setOrders(ordersData);
      setMenuItems(itemsData);
      setCategories(categoriesData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  // Save table configuration
  const saveTableConfig = () => {
    setNumTables(parseInt(tempTableCount) || 8);
    localStorage.setItem('numTables', tempTableCount);
    setShowConfig(false);
    toast.success(`Table layout updated to ${tempTableCount} tables`);
  };

  // Parse and import CSV menu
  const handleCsvImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvImporting(true);
    setCsvError('');

    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      
      if (lines.length < 2) {
        setCsvError('CSV must have at least a header row and one data row');
        setCsvImporting(false);
        return;
      }

      // Parse header
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
      const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('item'));
      const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('cost'));
      const categoryIdx = headers.findIndex(h => h.includes('category'));

      if (nameIdx === -1 || priceIdx === -1) {
        setCsvError('CSV must have "name" and "price" columns');
        setCsvImporting(false);
        return;
      }

      // Parse data rows
      const items = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(',').map(c => c.trim());
        const name = cols[nameIdx];
        const price = parseFloat(cols[priceIdx]);
        const category = categoryIdx >= 0 ? cols[categoryIdx] : 'General';

        if (!name || isNaN(price)) {
          console.warn(`Skipping row ${i + 1}: invalid data`);
          continue;
        }

        items.push({ name, price, category });
      }

      if (items.length === 0) {
        setCsvError('No valid items found in CSV');
        setCsvImporting(false);
        return;
      }

      // Create categories and items
      const categoryMap = {};
      let importedCount = 0;
      let errorCount = 0;

      for (const item of items) {
        try {
          let categoryId;

          // Create or use existing category
          if (!categoryMap[item.category]) {
            try {
              const catResponse = await createCategory({ 
                name: item.category 
              });
              categoryMap[item.category] = catResponse.id || catResponse;
              categoryId = categoryMap[item.category];
              console.log(`Created category: ${item.category} (${categoryId})`);
            } catch (catErr) {
              console.error(`Failed to create category "${item.category}":`, catErr);
              errorCount++;
              continue;
            }
          } else {
            categoryId = categoryMap[item.category];
          }

          // Create menu item
          const itemResponse = await createMenuItem({
            name: item.name,
            price: item.price,
            category_id: categoryId,
            description: '',
            available: true
          });

          console.log(`Created item: ${item.name} - ₹${item.price}`);
          importedCount++;
        } catch (err) {
          console.error(`Error creating item "${item.name}":`, err);
          errorCount++;
        }
      }

      if (importedCount > 0) {
        toast.success(`Imported ${importedCount} items from CSV${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
        await loadData();
      } else if (errorCount > 0) {
        setCsvError(`Failed to import all items. Check console for details.`);
      }
      
      // Reset file input
      event.target.value = '';
    } catch (err) {
      console.error('CSV import error:', err);
      setCsvError(`Failed to parse CSV: ${err.message}`);
    } finally {
      setCsvImporting(false);
    }
  };

  // Get order for specific table
  const getTableOrder = (tableNum) => {
    return orders.find(o => o.table_id === `table_${tableNum}` && o.status !== 'completed');
  };

  // Get total amount for table
  const getTableTotal = (tableNum) => {
    const order = getTableOrder(tableNum);
    return order ? order.total : 0;
  };

  // Get table status color
  const getTableStatus = (tableNum) => {
    const order = getTableOrder(tableNum);
    if (!order) return 'bg-gray-200'; // Available
    if (order.status === 'active') return 'bg-orange-200'; // Ordering
    if (order.status === 'preparing') return 'bg-yellow-200'; // Preparing
    if (order.status === 'ready') return 'bg-blue-200'; // Ready
    return 'bg-gray-200';
  };

  const getTableStatusLabel = (tableNum) => {
    const order = getTableOrder(tableNum);
    if (!order) return 'Available';
    switch (order.status) {
      case 'active': return 'Ordering';
      case 'preparing': return 'Preparing';
      case 'ready': return 'Ready';
      default: return 'Available';
    }
  };

  // Open table for ordering
  const openTable = (tableNum) => {
    const order = getTableOrder(tableNum);
    if (order) {
      // Load existing order into cart
      setCart(order.items || []);
    } else {
      setCart([]);
    }
    setSelectedTable(tableNum);
    setShowOrderDialog(true);
  };

  // Close table dialog
  const closeTable = () => {
    setSelectedTable(null);
    setShowOrderDialog(false);
    setCart([]);
    setSelectedCategory('all');
    setSearchTerm('');
  };

  // Add item to cart (with auto price fetch)
  const addToCart = (item) => {
    const existing = cart.find(c => c.menu_item_id === item.id);
    if (existing) {
      existing.quantity += 1;
      setCart([...cart]);
    } else {
      setCart([...cart, {
        menu_item_id: item.id,
        menu_item_name: item.name,
        quantity: 1,
        price: parseFloat(item.price) || 0,  // Fetch price from menu item
        variants: [],
        addons: [],
        notes: ''
      }]);
    }
  };

  // Update cart item quantity
  const updateCartQuantity = (index, delta) => {
    const newCart = [...cart];
    newCart[index].quantity += delta;
    if (newCart[index].quantity <= 0) {
      newCart.splice(index, 1);
    }
    setCart(newCart);
  };

  // Remove item from cart
  const removeFromCart = (index) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  // Save order
  const saveOrder = async () => {
    if (!cart.length) {
      toast.error('Cart is empty');
      return;
    }

    try {
      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const tax = subtotal * 0.05;
      const total = subtotal + tax;

      const existingOrder = getTableOrder(selectedTable);

      if (existingOrder) {
        // Update existing order
        await updateOrder(existingOrder.id, {
          cafe_id: cafeId,
          table_id: `table_${selectedTable}`,
          items: cart,
          status: existingOrder.status
        });
        toast.success('Order updated');
      } else {
        // Create new order
        await createOrder({
          cafe_id: cafeId,
          table_id: `table_${selectedTable}`,
          items: cart,
          status: 'active'
        });
        toast.success('Order created');
      }

      await loadData();
      closeTable();
    } catch (err) {
      console.error('Error saving order:', err);
      toast.error('Failed to save order');
    }
  };

  // Settle bill
  const settleBill = async (tableNum) => {
    const order = getTableOrder(tableNum);
    if (!order) {
      toast.error('No order found for this table');
      return;
    }

    try {
      const subtotal = order.subtotal || 0;
      const tax = order.tax || 0;
      const total = order.total || 0;

      // Create bill
      await createBill({
        cafe_id: cafeId,
        table_id: `table_${tableNum}`,
        items: order.items,
        tax_percentage: 5,
        payment_method: 'cash',
        order_id: order.id
      });

      toast.success('Bill created and order completed');
      await loadData();
    } catch (err) {
      console.error('Error settling bill:', err);
      toast.error('Failed to create bill');
    }
  };

  // Cancel order
  const cancelTableOrder = async (tableNum) => {
    const order = getTableOrder(tableNum);
    if (!order) return;

    try {
      await cancelOrder(order.id);
      toast.success('Order cancelled');
      await loadData();
    } catch (err) {
      toast.error('Failed to cancel order');
    }
  };

  // Get filtered menu items
  const getFilteredItems = () => {
    let filtered = menuItems;
    
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.category_id === selectedCategory);
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(term) ||
        (item.description && item.description.toLowerCase().includes(term))
      );
    }
    
    return filtered;
  };

  const filteredItems = getFilteredItems();
  const cartSubtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartTax = cartSubtotal * 0.05;
  const cartTotal = cartSubtotal + cartTax;

  return (
    <div className="w-full h-full bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Table Management</h1>
          {menuItems.length > 0 && (
            <div className="text-sm text-gray-600 bg-green-50 px-3 py-1 rounded-lg border border-green-200">
              ✓ {menuItems.length} items loaded
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Reload Menu
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTempTableCount(numTables);
              setShowConfig(true);
            }}
            className="flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Configure
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="m-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Table Grid */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: numTables }).map((_, idx) => {
            const tableNum = idx + 1;
            const total = getTableTotal(tableNum);
            const status = getTableStatus(tableNum);
            const statusLabel = getTableStatusLabel(tableNum);
            const order = getTableOrder(tableNum);

            return (
              <div key={tableNum}>
                <button
                  onClick={() => openTable(tableNum)}
                  className={`w-full aspect-square rounded-lg border-2 border-gray-300 ${status} 
                    hover:shadow-lg transition-all duration-200 flex flex-col items-center justify-center 
                    p-4 text-center cursor-pointer hover:scale-105`}
                >
                  {/* Table Number */}
                  <div className="text-3xl font-bold text-gray-900 mb-2">
                    {tableNum}
                  </div>

                  {/* Amount if order exists */}
                  {total > 0 && (
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-sm font-medium text-gray-700">
                        ₹{total.toFixed(2)}
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {statusLabel}
                      </Badge>
                    </div>
                  )}

                  {/* Bill button if order is ready */}
                  {order && order.status === 'ready' && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        settleBill(tableNum);
                      }}
                      className="mt-2 w-full h-6 text-xs"
                    >
                      Bill
                    </Button>
                  )}
                </button>

                {/* Cancel button if order exists */}
                {order && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cancelTableOrder(tableNum)}
                    className="w-full mt-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Cancel
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Table Configuration Dialog */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configure Settings</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="tables" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="tables">Tables</TabsTrigger>
              <TabsTrigger value="menu">Import Menu</TabsTrigger>
            </TabsList>

            {/* Tables Tab */}
            <TabsContent value="tables" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="table-count">Number of Tables</Label>
                <Input
                  id="table-count"
                  type="number"
                  min="1"
                  max="50"
                  value={tempTableCount}
                  onChange={(e) => setTempTableCount(e.target.value)}
                  className="text-lg"
                />
              </div>
              <div className="text-sm text-gray-600">
                Current: {numTables} tables
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowConfig(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveTableConfig}
                  className="flex-1"
                >
                  Save
                </Button>
              </div>
            </TabsContent>

            {/* Menu Import Tab */}
            <TabsContent value="menu" className="space-y-4">
              <div className="space-y-3">
                {csvError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{csvError}</AlertDescription>
                  </Alert>
                )}

                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-green-900 font-medium">✓ Auto-Save Enabled</p>
                  <p className="text-xs text-green-800 mt-1">
                    Items are automatically saved to your menu after successful import. No additional save needed.
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-sm mb-2 text-blue-900">CSV Format</h4>
                  <p className="text-xs text-blue-800 mb-3">
                    Your CSV file must have at least two columns: "name" and "price". 
                    Optionally add a "category" column.
                  </p>
                  <div className="bg-white p-2 rounded font-mono text-xs overflow-x-auto">
                    <div>name,price,category</div>
                    <div>Espresso,80,Coffee</div>
                    <div>Latte,120,Coffee</div>
                    <div>Biryani,250,Main</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="csv-upload" className="flex items-center gap-2 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>Upload CSV File</span>
                  </Label>
                  <Input
                    id="csv-upload"
                    type="file"
                    accept=".csv"
                    onChange={handleCsvImport}
                    disabled={csvImporting}
                    className="cursor-pointer"
                  />
                  {csvImporting && (
                    <div className="text-sm text-gray-600 flex items-center gap-2">
                      <div className="animate-spin">⚙️</div>
                      Importing items...
                    </div>
                  )}
                </div>

                <div className="text-xs text-gray-600 space-y-1">
                  <p>✓ Automatically creates categories from CSV</p>
                  <p>✓ Handles duplicate items gracefully</p>
                  <p>✓ All items saved instantly to database</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowConfig(false)}
                  className="flex-1"
                >
                  Close
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Order Dialog */}
      <Dialog open={showOrderDialog} onOpenChange={closeTable}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Table {selectedTable} - Order Management</DialogTitle>
          </DialogHeader>

          <div className="flex gap-4 h-[calc(90vh-150px)]">
            {/* Left: Menu */}
            <div className="flex-1 flex flex-col border-r overflow-hidden">
              {/* Search & Category */}
              <div className="p-3 space-y-3 border-b">
                <Input
                  placeholder="Search items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 text-sm"
                />
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Menu Items Grid */}
              <div className="flex-1 overflow-auto p-3 space-y-2">
                {filteredItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="w-full p-2 text-left border rounded hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{item.name}</div>
                        <div className="text-xs text-gray-500">₹{item.price}</div>
                      </div>
                      <Plus className="w-4 h-4 text-blue-600" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Cart */}
            <div className="w-80 flex flex-col border-l">
              {/* Cart Header */}
              <div className="p-3 border-b bg-gray-50">
                <h3 className="font-bold text-sm">Order Cart</h3>
              </div>

              {/* Cart Items */}
              <div className="flex-1 overflow-auto p-3 space-y-2">
                {cart.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-8">
                    No items added
                  </div>
                ) : (
                  cart.map((item, idx) => (
                    <div key={idx} className="bg-gray-50 p-2 rounded text-sm">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex-1">
                          <div className="font-medium">{item.menu_item_name}</div>
                          <div className="text-gray-600">₹{item.price} each</div>
                        </div>
                        <button
                          onClick={() => removeFromCart(idx)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateCartQuantity(idx, -1)}
                          className="h-6 w-6 p-0"
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="flex-1 text-center font-medium">
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateCartQuantity(idx, 1)}
                          className="h-6 w-6 p-0"
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                        <div className="text-right font-medium">
                          ₹{(item.price * item.quantity).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Cart Totals */}
              <div className="border-t p-3 space-y-2 bg-gray-50">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>₹{cartSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Tax (5%):</span>
                  <span>₹{cartTax.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total:</span>
                  <span>₹{cartTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-3 border-t space-y-2">
                <Button
                  onClick={saveOrder}
                  disabled={cart.length === 0}
                  className="w-full"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Save Order
                </Button>
                <Button
                  variant="outline"
                  onClick={closeTable}
                  className="w-full"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
