import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { getReservations, getTables, createReservation, cancelReservation } from '@/utils/api';
import { Calendar, Plus, X, Users, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const ReservationView = ({ cafeId }) => {
  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    table_id: '',
    customer_name: '',
    customer_phone: '',
    guest_count: '',
    reservation_date: '',
    reservation_time: '',
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, [cafeId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [reservationsData, tablesData] = await Promise.all([
        getReservations(cafeId),
        getTables(cafeId)
      ]);
      setReservations(reservationsData.filter(r => r.status !== 'cancelled'));
      setTables(tablesData);
    } catch (error) {
      console.error('Error loading reservations:', error);
      toast.error('Failed to load reservations');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const data = {
        ...formData,
        cafe_id: cafeId,
        guest_count: parseInt(formData.guest_count)
      };
      await createReservation(data);
      toast.success('Reservation created successfully');
      setShowAddDialog(false);
      setFormData({
        table_id: '',
        customer_name: '',
        customer_phone: '',
        guest_count: '',
        reservation_date: '',
        reservation_time: '',
        notes: ''
      });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create reservation');
    }
  };

  const handleCancel = async (reservationId) => {
    try {
      await cancelReservation(reservationId);
      toast.success('Reservation cancelled');
      loadData();
    } catch (error) {
      toast.error('Failed to cancel reservation');
    }
  };

  const getTableName = (tableId) => {
    const table = tables.find(t => t.id === tableId);
    return table?.name || 'Unknown';
  };

  const groupByDate = () => {
    const grouped = {};
    reservations.forEach(res => {
      if (!grouped[res.reservation_date]) {
        grouped[res.reservation_date] = [];
      }
      grouped[res.reservation_date].push(res);
    });
    return grouped;
  };

  const groupedReservations = groupByDate();
  const dates = Object.keys(groupedReservations).sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading reservations...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 bg-gray-50 overflow-auto" data-testid="reservation-view">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Reservations</h2>
        <Button onClick={() => setShowAddDialog(true)} data-testid="add-reservation-button">
          <Plus className="w-4 h-4 mr-2" />
          New Reservation
        </Button>
      </div>

      {/* Reservations by Date */}
      {dates.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No reservations</p>
          <Button 
            className="mt-4" 
            variant="outline" 
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create First Reservation
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {dates.map(date => (
            <div key={date}>
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <Calendar className="w-5 h-5 mr-2" />
                {new Date(date).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupedReservations[date].map(reservation => (
                  <Card key={reservation.id} data-testid={`reservation-${reservation.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{reservation.customer_name}</CardTitle>
                          <p className="text-sm text-gray-600">{reservation.customer_phone}</p>
                        </div>
                        <Badge variant="secondary">{getTableName(reservation.table_id)}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center text-sm">
                          <Clock className="w-4 h-4 mr-2 text-gray-500" />
                          <span>{reservation.reservation_time}</span>
                        </div>
                        <div className="flex items-center text-sm">
                          <Users className="w-4 h-4 mr-2 text-gray-500" />
                          <span>{reservation.guest_count} guests</span>
                        </div>
                        {reservation.notes && (
                          <p className="text-sm text-gray-600 mt-2">
                            Note: {reservation.notes}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleCancel(reservation.id)}
                        data-testid={`cancel-reservation-${reservation.id}`}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Reservation Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent data-testid="add-reservation-dialog">
          <DialogHeader>
            <DialogTitle>New Reservation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customer-name">Customer Name *</Label>
                <Input
                  id="customer-name"
                  value={formData.customer_name}
                  onChange={(e) => setFormData({...formData, customer_name: e.target.value})}
                  placeholder="John Doe"
                  data-testid="customer-name-input"
                />
              </div>
              <div>
                <Label htmlFor="customer-phone">Phone Number *</Label>
                <Input
                  id="customer-phone"
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({...formData, customer_phone: e.target.value})}
                  placeholder="+91 9876543210"
                  data-testid="customer-phone-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reservation-date">Date *</Label>
                <Input
                  id="reservation-date"
                  type="date"
                  value={formData.reservation_date}
                  onChange={(e) => setFormData({...formData, reservation_date: e.target.value})}
                  data-testid="reservation-date-input"
                />
              </div>
              <div>
                <Label htmlFor="reservation-time">Time *</Label>
                <Input
                  id="reservation-time"
                  type="time"
                  value={formData.reservation_time}
                  onChange={(e) => setFormData({...formData, reservation_time: e.target.value})}
                  data-testid="reservation-time-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="table">Table *</Label>
                <Select 
                  value={formData.table_id} 
                  onValueChange={(val) => setFormData({...formData, table_id: val})}
                >
                  <SelectTrigger data-testid="table-select">
                    <SelectValue placeholder="Select table" />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map(table => (
                      <SelectItem key={table.id} value={table.id}>
                        {table.name} ({table.capacity} seats)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="guest-count">Guest Count *</Label>
                <Input
                  id="guest-count"
                  type="number"
                  min="1"
                  value={formData.guest_count}
                  onChange={(e) => setFormData({...formData, guest_count: e.target.value})}
                  placeholder="2"
                  data-testid="guest-count-input"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Special requests..."
                data-testid="notes-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.customer_name || !formData.customer_phone || !formData.table_id || !formData.guest_count || !formData.reservation_date || !formData.reservation_time}
              data-testid="confirm-reservation"
            >
              Create Reservation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
