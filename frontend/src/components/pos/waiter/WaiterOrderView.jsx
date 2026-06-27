import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, 
  Minus, 
  Search, 
  ShoppingCart, 
  Send,
  Trash2,
  MessageSquare
} from 'lucide-react';
import { getMenuItems, getCategories, createOrder, updateOrder } from '@/utils/api';
import { toast } from 'sonner';

export const WaiterOrderView = ({ cafeId, table, waiterId, waiterName }) => {
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadMenu();
  }, [cafeId]);

  useEffect(() => {
    filterItems();
  }, [menuItems, selectedCategory, searchQuery]);

  const loadMenu = async () => {
    try {
      setLoading(true);
      const [categoriesData, itemsData] = await Promise.all([
        getCategories(),
        getMenuItems()
      ]);
      
      setCategories(categoriesData);
      setMenuItems(itemsData.filter(item => item.available));
      setFilteredItems(itemsData.filter(item => item.available));
    } catch (error) {
      console.error('Error loading menu:', error);
      toast.error('Failed to load menu');
    } finally {
      setLoading(false);
    }
  };

  const filterItems = () => {
    let filtered = menuItems;

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.category_id === selectedCategory);
    }

    if (searchQuery) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredItems(filtered);
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
    
    toast.success(`Added ${item.name} to order`);
  };

  const updateCartItemQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(itemId);
      return;
    }

    setCart(cart.map(item =>
      item.menu_item_id === itemId
        ? { ...item, quantity: newQuantity }
        : item
    ));
  };

  const updateCartItemNotes = (itemId, notes) => {
    setCart(cart.map(item =>
      item.menu_item_id === itemId
        ? { ...item, notes }
        : item
    ));
  };

  const removeFromCart = (itemId) => {
    setCart(cart.filter(item => item.menu_item_id !== itemId));
  };

  const clearCart = () => {
    setCart([]);
  };

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const sendToKitchen = async () => {
    if (cart.length === 0) {
      toast.error('Please add items to the order');
      return;
    }

    try {
      setSending(true);
      
      const orderData = {
        cafe_id: cafeId,
        table_id: table.id,
        items: cart,
        waiter_id: waiterId,
        waiter_name: waiterName,
        status: 'pending' // Will be processed by master interface
      };

      await createOrder(orderData);
      
      toast.success(`Order sent for ${table.name}!`);
      setCart([]);
      
      // In a real app, this would trigger real-time sync to master interface
      // For now, we'll just show success
      
    } catch (error) {
      console.error('Error sending order:', error);
      toast.error('Failed to send order');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading menu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex">
      {/* Menu Section */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Menu</h2>
            <Badge variant="outline" className="text-sm">
              {filteredItems.length} items
            </Badge>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search menu items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Categories */}
          <div className="flex flex-wrap gap-2 mb-6">
            <Button
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('all')}
            >
              All Items
            </Button>
            {categories.map(category => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Menu Items */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map(item => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base font-medium line-clamp-2">
                    {item.name}
                  </CardTitle>
                  <Badge variant="secondary" className="ml-2 shrink-0">
                    ₹{item.price}
                  </Badge>
                </div>
                {item.description && (
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {item.description}
                  </p>
                )}
              </CardHeader>
              
              <CardContent className="pt-0">
                <Button
                  onClick={() => addToCart(item)}
                  className="w-full"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add to Order
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No items found</h3>
            <p className="text-gray-600">Try adjusting your search or category filter.</p>
          </div>
        )}
      </div>

      {/* Cart Section */}
      <div className="w-96 bg-gray-50 border-l p-6 overflow-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <ShoppingCart className="w-5 h-5 mr-2" />
              Order ({cart.length})
            </h3>
            {cart.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCart}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>

          <div className="text-sm text-gray-600 mb-4">
            Table: <span className="font-medium">{table.name}</span>
          </div>
        </div>

        {cart.length === 0 ? (
          <div className="text-center py-8">
            <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No items in order</p>
            <p className="text-sm text-gray-500">Add items from the menu</p>
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-6">
              {cart.map(item => (
                <Card key={item.menu_item_id} className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-medium text-sm">{item.menu_item_name}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFromCart(item.menu_item_id)}
                      className="text-red-600 hover:text-red-700 p-1 h-auto"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateCartItemQuantity(item.menu_item_id, item.quantity - 1)}
                        className="h-8 w-8 p-0"
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateCartItemQuantity(item.menu_item_id, item.quantity + 1)}
                        className="h-8 w-8 p-0"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <span className="text-sm font-medium">
                      ₹{(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>

                  <div className="relative">
                    <MessageSquare className="absolute left-2 top-2 text-gray-400 w-3 h-3" />
                    <Textarea
                      placeholder="Special instructions..."
                      value={item.notes}
                      onChange={(e) => updateCartItemNotes(item.menu_item_id, e.target.value)}
                      className="pl-8 text-xs resize-none"
                      rows={2}
                    />
                  </div>
                </Card>
              ))}
            </div>

            <Separator className="my-4" />

            <div className="space-y-3">
              <div className="flex justify-between items-center text-lg font-semibold">
                <span>Total:</span>
                <span>₹{calculateTotal().toFixed(2)}</span>
              </div>

              <Button
                onClick={sendToKitchen}
                disabled={sending || cart.length === 0}
                className="w-full"
                size="lg"
              >
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send to Kitchen
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};