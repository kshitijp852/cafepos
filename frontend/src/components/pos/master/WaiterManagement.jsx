import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Plus, 
  Users, 
  Smartphone, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Trash2,
  Shield,
  Wifi
} from 'lucide-react';
import { 
  getWaiters, 
  createWaiter, 
  authenticateWaiterDevice, 
  getDeviceSessions,
  deactivateWaiter 
} from '@/utils/api';
import { toast } from 'sonner';

export const WaiterManagement = ({ cafeId, currentUser }) => {
  const [waiters, setWaiters] = useState([]);
  const [deviceSessions, setDeviceSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [selectedWaiter, setSelectedWaiter] = useState(null);
  const [newWaiter, setNewWaiter] = useState({ name: '', pin: '' });
  const [authData, setAuthData] = useState({ pin: '', deviceId: '' });
  const [creating, setCreating] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  useEffect(() => {
    loadData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [cafeId]);

  const loadData = async () => {
    try {
      const [waitersData, sessionsData] = await Promise.all([
        getWaiters(cafeId),
        getDeviceSessions(cafeId)
      ]);
      
      setWaiters(waitersData);
      setDeviceSessions(sessionsData);
    } catch (error) {
      console.error('Error loading waiter data:', error);
      toast.error('Failed to load waiter data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWaiter = async () => {
    if (!newWaiter.name.trim()) {
      toast.error('Please enter waiter name');
      return;
    }
    
    if (!newWaiter.pin || newWaiter.pin.length !== 4 || !newWaiter.pin.match(/^\d{4}$/)) {
      toast.error('PIN must be exactly 4 digits');
      return;
    }

    try {
      setCreating(true);
      
      await createWaiter({
        name: newWaiter.name.trim(),
        pin: newWaiter.pin,
        cafe_id: cafeId
      });
      
      toast.success(`Waiter ${newWaiter.name} created successfully`);
      setNewWaiter({ name: '', pin: '' });
      setShowCreateDialog(false);
      loadData();
    } catch (error) {
      console.error('Error creating waiter:', error);
      toast.error(error.response?.data?.detail || 'Failed to create waiter');
    } finally {
      setCreating(false);
    }
  };

  const handleAuthenticateDevice = async () => {
    if (!authData.pin || authData.pin.length !== 4 || !authData.pin.match(/^\d{4}$/)) {
      toast.error('PIN must be exactly 4 digits');
      return;
    }
    
    if (!authData.deviceId.trim()) {
      toast.error('Please enter device ID');
      return;
    }

    try {
      setAuthenticating(true);
      
      const response = await authenticateWaiterDevice({
        waiter_id: selectedWaiter.id,
        pin: authData.pin,
        device_id: authData.deviceId.trim()
      });
      
      toast.success(response.message);
      setAuthData({ pin: '', deviceId: '' });
      setShowAuthDialog(false);
      setSelectedWaiter(null);
      loadData();
    } catch (error) {
      console.error('Error authenticating device:', error);
      toast.error(error.response?.data?.detail || 'Failed to authenticate device');
    } finally {
      setAuthenticating(false);
    }
  };

  const handleDeactivateWaiter = async (waiterId, waiterName) => {
    if (!confirm(`Are you sure you want to deactivate ${waiterName}? This will log them out of all devices.`)) {
      return;
    }

    try {
      await deactivateWaiter(waiterId);
      toast.success(`${waiterName} has been deactivated`);
      loadData();
    } catch (error) {
      console.error('Error deactivating waiter:', error);
      toast.error('Failed to deactivate waiter');
    }
  };

  const getWaiterSessions = (waiterId) => {
    return deviceSessions.filter(session => session.waiter_id === waiterId);
  };

  const getTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMinutes = Math.floor((now - time) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading waiters...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Staff Management</h2>
          <p className="text-gray-600 mt-1">Manage waiters and device authentication</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Waiter
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Users className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{waiters.length}</p>
                <p className="text-sm text-gray-600">Total Waiters</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Smartphone className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{deviceSessions.length}</p>
                <p className="text-sm text-gray-600">Active Devices</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Wifi className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">
                  {waiters.filter(w => w.is_active).length}
                </p>
                <p className="text-sm text-gray-600">Active Waiters</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Waiters List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Waiters</h3>
        
        {waiters.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No waiters yet</h3>
              <p className="text-gray-600 mb-4">Add your first waiter to get started</p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add First Waiter
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {waiters.map(waiter => {
              const sessions = getWaiterSessions(waiter.id);
              const isOnline = sessions.some(s => {
                const lastActivity = new Date(s.last_activity);
                const now = new Date();
                return (now - lastActivity) < 5 * 60 * 1000; // 5 minutes
              });

              return (
                <Card key={waiter.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <span>{waiter.name}</span>
                        {isOnline && (
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            Online
                          </Badge>
                        )}
                        {!waiter.is_active && (
                          <Badge variant="destructive">
                            Inactive
                          </Badge>
                        )}
                      </CardTitle>
                    </div>
                    
                    <div className="text-sm text-gray-600">
                      Created {getTimeAgo(waiter.created_at)}
                      {waiter.last_active && (
                        <span> • Last active {getTimeAgo(waiter.last_active)}</span>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Device Sessions */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Authenticated Devices</span>
                        <Badge variant="outline">
                          {sessions.length} device{sessions.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      
                      {sessions.length === 0 ? (
                        <p className="text-sm text-gray-500">No devices authenticated</p>
                      ) : (
                        <div className="space-y-2">
                          {sessions.map(session => (
                            <div key={session.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                              <div className="flex items-center space-x-2">
                                <Smartphone className="w-4 h-4 text-gray-600" />
                                <span className="text-sm font-mono">
                                  {session.device_id.substring(0, 12)}...
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                {isOnline ? (
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                ) : (
                                  <Clock className="w-4 h-4 text-gray-400" />
                                )}
                                <span className="text-xs text-gray-500">
                                  {getTimeAgo(session.last_activity)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Actions */}
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedWaiter(waiter);
                          setShowAuthDialog(true);
                        }}
                        disabled={!waiter.is_active}
                      >
                        <Shield className="w-4 h-4 mr-2" />
                        Authenticate Device
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeactivateWaiter(waiter.id, waiter.name)}
                        className="text-red-600 hover:text-red-700"
                        disabled={!waiter.is_active}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Deactivate
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Waiter Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Waiter</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="waiter-name">Waiter Name</Label>
              <Input
                id="waiter-name"
                placeholder="Enter waiter's full name"
                value={newWaiter.name}
                onChange={(e) => setNewWaiter({ ...newWaiter, name: e.target.value })}
              />
            </div>
            
            <div>
              <Label htmlFor="waiter-pin">4-Digit PIN</Label>
              <Input
                id="waiter-pin"
                type="password"
                placeholder="1234"
                maxLength={4}
                value={newWaiter.pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  setNewWaiter({ ...newWaiter, pin: value });
                }}
              />
              <p className="text-sm text-gray-500 mt-1">
                This PIN will be used to authenticate the waiter's devices
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateWaiter} disabled={creating}>
              {creating ? 'Creating...' : 'Create Waiter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Authenticate Device Dialog */}
      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Authenticate Device for {selectedWaiter?.name}
            </DialogTitle>
          </DialogHeader>
          
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              The waiter should be present with their device. They will provide you with the device ID shown on their screen.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div>
              <Label htmlFor="device-id">Device ID</Label>
              <Input
                id="device-id"
                placeholder="Device ID from waiter's screen"
                value={authData.deviceId}
                onChange={(e) => setAuthData({ ...authData, deviceId: e.target.value })}
              />
            </div>
            
            <div>
              <Label htmlFor="auth-pin">Waiter's PIN</Label>
              <Input
                id="auth-pin"
                type="password"
                placeholder="4-digit PIN"
                maxLength={4}
                value={authData.pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  setAuthData({ ...authData, pin: value });
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAuthDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAuthenticateDevice} disabled={authenticating}>
              {authenticating ? 'Authenticating...' : 'Authenticate Device'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};