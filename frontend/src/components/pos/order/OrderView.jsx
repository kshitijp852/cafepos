import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Minus, ShoppingCart, Printer, X } from 'lucide-react';
import { getMenuItems, getCategories, createBill, printBill, printKOT } from '@/utils/api';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const OrderView = ({ cafeId }) => {
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [taxPercentage, setTaxPercentage] = useState(5);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMenu();
  }, [cafeId]);

  const loadMenu = async () => {
    try {
      setLoading(true);
      const [items, cats] = await Promise.all([
        getMenuItems(),
        getCategories()
      ]);
      setMenuItems(items.filter(item => item.available));
      setCategories(cats);
    } catch (error) {
      console.error('Error loading menu:', error);
      toast.error('Failed to load menu');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

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
        variants: [],
        addons: [],
        notes: ''
      }]);
    }
    toast.success(`${item.name} added to cart`);
  };

  const updateQuantity = (itemId, change) => {
    setCart(cart.map(item => {
      if (item.menu_item_id === itemId) {
        const newQuantity = item.quantity + change;
        return newQuantity > 0 ? { ...item, quantity: newQuantity } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (itemId) => {
    setCart(cart.filter(item => item.menu_item_id !== itemId));
  };

  const calculateTotals = () => {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * (taxPercentage / 100);
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    try {
      const { subtotal, tax, total } = calculateTotals();
      
      const billData = {
        cafe_id: cafeId,
        items: cart,
        tax_percentage: taxPercentage,
        payment_method: paymentMethod
      };

      const bill = await createBill(billData);
      
      // Mock print bill
      await printBill(bill.id);
      
      toast.success(`Bill #${bill.bill_number} created successfully!`);
      
      // Clear cart
      setCart([]);
      setShowCheckout(false);
    } catch (error) {
      console.error('Error creating bill:', error);
      toast.error(error.response?.data?.detail || 'Failed to create bill');
    }
  };

  const { subtotal, tax, total } = calculateTotals();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading menu...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 h-full" data-testid="order-view">
      {/* Menu Section */}
      <div className="flex-1 p-6 bg-gray-50 overflow-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-4">Menu</h2>
          
          {/* Search */}
          <Input
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-4"
            data-testid="menu-search-input"
          />

          {/* Category Filter */}
          <div className="flex space-x-2 mb-6 overflow-x-auto">
            <Button
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('all')}
              data-testid="category-all"
            >
              All Items
            </Button>
            {categories.map(category => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(category.id)}
                data-testid={`category-${category.id}`}
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Menu Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map(item => (
            <Card key={item.id} className="hover:shadow-lg transition-shadow cursor-pointer" data-testid={`menu-item-${item.id}`}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{item.name}</h3>
                    {item.description && (
                      <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center mt-3">
                  <span className="text-xl font-bold text-green-600">₹{item.price.toFixed(2)}</span>
                  <Button 
                    size="sm" 
                    onClick={() => addToCart(item)}
                    data-testid={`add-to-cart-${item.id}`}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No items found</p>
          </div>
        )}
      </div>

      {/* Cart Section */}
      <div className="w-96 bg-white border-l border-gray-200 flex flex-col" data-testid="cart-section">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold">Current Order</h2>
            <ShoppingCart className="w-6 h-6 text-gray-600" />
          </div>
          <p className="text-sm text-gray-600">{cart.length} items</p>
        </div>

        <ScrollArea className="flex-1 p-6">
          {cart.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Cart is empty</p>
              <p className="text-sm text-gray-400 mt-1">Add items from menu</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map(item => (
                <Card key={item.menu_item_id} data-testid={`cart-item-${item.menu_item_id}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h4 className="font-semibold">{item.menu_item_name}</h4>
                        <p className="text-sm text-gray-600">₹{item.price.toFixed(2)} each</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromCart(item.menu_item_id)}
                        data-testid={`remove-item-${item.menu_item_id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateQuantity(item.menu_item_id, -1)}
                          data-testid={`decrease-qty-${item.menu_item_id}`}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="font-semibold w-8 text-center" data-testid={`quantity-${item.menu_item_id}`}>
                          {item.quantity}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateQuantity(item.menu_item_id, 1)}
                          data-testid={`increase-qty-${item.menu_item_id}`}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <span className="font-bold">₹{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Cart Footer */}
        <div className="p-6 border-t border-gray-200 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Tax ({taxPercentage}%)</span>
              <span>₹{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t">
              <span>Total</span>
              <span data-testid="cart-total">₹{total.toFixed(2)}</span>
            </div>
          </div>
          <Button 
            className="w-full" 
            size="lg"
            disabled={cart.length === 0}
            onClick={() => setShowCheckout(true)}
            data-testid="checkout-button"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Checkout
          </Button>
        </div>
      </div>

      {/* Checkout Dialog */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent data-testid="checkout-dialog">
          <DialogHeader>
            <DialogTitle>Complete Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Subtotal:</span>
                <span className="font-semibold">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Tax:</span>
                <span className="font-semibold">₹{tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span>Total:</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
            </div>

            <div>
              <Label htmlFor="tax-percentage">Tax Percentage</Label>
              <Select value={taxPercentage.toString()} onValueChange={(val) => setTaxPercentage(parseFloat(val))}>
                <SelectTrigger data-testid="tax-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0% (No Tax)</SelectItem>
                  <SelectItem value="5">5% (GST)</SelectItem>
                  <SelectItem value="12">12% (GST)</SelectItem>
                  <SelectItem value="18">18% (GST)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="payment-method">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger data-testid="payment-method-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckout(false)}>Cancel</Button>
            <Button onClick={handleCheckout} data-testid="confirm-checkout">
              <Printer className="w-4 h-4 mr-2" />
              Complete & Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
