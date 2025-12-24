import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { getBills, printBill } from '@/utils/api';
import { Search, Printer, Download, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';

export const HistoryView = ({ cafeId }) => {
  const [bills, setBills] = useState([]);
  const [filteredBills, setFilteredBills] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBills();
  }, [cafeId]);

  useEffect(() => {
    filterBills();
  }, [bills, searchQuery]);

  const loadBills = async () => {
    try {
      setLoading(true);
      const data = await getBills(cafeId, 100);
      setBills(data);
    } catch (error) {
      console.error('Error loading bills:', error);
      toast.error('Failed to load bills');
    } finally {
      setLoading(false);
    }
  };

  const filterBills = () => {
    if (!searchQuery) {
      setFilteredBills(bills);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = bills.filter(bill => 
      bill.bill_number.toString().includes(query) ||
      bill.payment_method.toLowerCase().includes(query) ||
      bill.total.toString().includes(query)
    );
    setFilteredBills(filtered);
  };

  const handlePrintBill = async (billId) => {
    try {
      await printBill(billId);
      toast.success('Bill sent to printer (mocked)');
    } catch (error) {
      toast.error('Failed to print bill');
    }
  };

  const formatDate = (dateString) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading history...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 bg-gray-50 overflow-auto" data-testid="history-view">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Bill History</h2>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            placeholder="Search by bill number, amount, or payment method..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="history-search-input"
          />
        </div>
      </div>

      {/* Bills List */}
      <div className="space-y-4">
        {filteredBills.map(bill => (
          <Card 
            key={bill.id} 
            className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => setSelectedBill(bill)}
            data-testid={`bill-${bill.id}`}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-xl font-bold">Bill #{bill.bill_number}</h3>
                    <Badge variant="secondary">{bill.payment_method.toUpperCase()}</Badge>
                    {bill.cloud_synced && (
                      <Badge variant="outline" className="text-green-600">✓ Synced</Badge>
                    )}
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      <span>{formatDate(bill.created_at)}</span>
                    </div>
                    <span>{bill.items.length} items</span>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-2xl font-bold text-green-600">₹{bill.total.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">Tax: ₹{bill.tax.toFixed(2)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrintBill(bill.id);
                    }}
                    data-testid={`print-bill-${bill.id}`}
                  >
                    <Printer className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredBills.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">
            {searchQuery ? 'No bills found matching your search' : 'No bills yet'}
          </p>
        </div>
      )}

      {/* Bill Details Dialog */}
      {selectedBill && (
        <Dialog open={!!selectedBill} onOpenChange={() => setSelectedBill(null)}>
          <DialogContent className="max-w-2xl" data-testid="bill-details-dialog">
            <DialogHeader>
              <DialogTitle>Bill #{selectedBill.bill_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Date & Time:</span>
                  <span>{formatDate(selectedBill.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Payment Method:</span>
                  <Badge>{selectedBill.payment_method.toUpperCase()}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Bill Hash:</span>
                  <span className="text-xs font-mono">{selectedBill.bill_hash.substring(0, 16)}...</span>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Items</h4>
                <div className="space-y-2">
                  {selectedBill.items.map((item, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                      <div className="flex-1">
                        <p className="font-medium">{item.menu_item_name}</p>
                        <p className="text-sm text-gray-600">Qty: {item.quantity} × ₹{item.price.toFixed(2)}</p>
                      </div>
                      <span className="font-semibold">₹{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹{selectedBill.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax ({selectedBill.tax_percentage}%):</span>
                  <span>₹{selectedBill.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold pt-2 border-t">
                  <span>Total:</span>
                  <span>₹{selectedBill.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex space-x-2">
                <Button 
                  className="flex-1" 
                  onClick={() => handlePrintBill(selectedBill.id)}
                  data-testid="reprint-bill-button"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Reprint Bill
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
