import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DollarSign, 
  Receipt, 
  TrendingUp, 
  Clock,
  AlertCircle
} from 'lucide-react';
import { getCurrentSession, openDaySession, closeDaySession, getDailyReport } from '@/utils/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export const DashboardView = ({ cafeId }) => {
  const [session, setSession] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOpenSession, setShowOpenSession] = useState(false);
  const [showCloseSession, setShowCloseSession] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');

  useEffect(() => {
    loadDashboard();
  }, [cafeId]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const [sessionData, reportData] = await Promise.all([
        getCurrentSession(cafeId),
        getDailyReport(cafeId)
      ]);
      setSession(sessionData);
      setReport(reportData);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSession = async () => {
    try {
      const data = await openDaySession({ cafe_id: cafeId, opening_cash: parseFloat(openingCash) });
      setSession(data);
      setShowOpenSession(false);
      setOpeningCash('');
      toast.success('Day session opened successfully');
      loadDashboard();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to open session');
    }
  };

  const handleCloseSession = async () => {
    try {
      await closeDaySession({ 
        session_id: session.id, 
        closing_cash: parseFloat(closingCash) 
      });
      setShowCloseSession(false);
      setClosingCash('');
      toast.success('Day session closed successfully');
      loadDashboard();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to close session');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  const cashDifference = session?.closing_cash 
    ? session.closing_cash - (session.expected_cash || 0)
    : 0;

  return (
    <div className="flex-1 p-6 bg-gray-50 overflow-auto" data-testid="dashboard-view">
      {/* Session Status */}
      <div className="mb-6">
        {!session || session.status === 'closed' ? (
          <Card className="border-yellow-200 bg-yellow-50" data-testid="session-closed-alert">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="w-6 h-6 text-yellow-600" />
                  <div>
                    <h3 className="font-semibold text-yellow-900">Day Session Not Started</h3>
                    <p className="text-sm text-yellow-700">Open a session to start taking orders</p>
                  </div>
                </div>
                <Button onClick={() => setShowOpenSession(true)} data-testid="open-session-button">
                  Open Session
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-green-200 bg-green-50" data-testid="session-active-alert">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Clock className="w-6 h-6 text-green-600" />
                  <div>
                    <h3 className="font-semibold text-green-900">Session Active</h3>
                    <p className="text-sm text-green-700">
                      Started: {new Date(session.opened_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <Button 
                  variant="destructive" 
                  onClick={() => setShowCloseSession(true)}
                  data-testid="close-session-button"
                >
                  Close Session
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card data-testid="total-sales-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{report?.total_sales?.toFixed(2) || '0.00'}</div>
            <p className="text-xs text-muted-foreground">Today's revenue</p>
          </CardContent>
        </Card>

        <Card data-testid="total-bills-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bills</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report?.total_bills || 0}</div>
            <p className="text-xs text-muted-foreground">Orders completed</p>
          </CardContent>
        </Card>

        <Card data-testid="opening-cash-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Opening Cash</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{session?.opening_cash?.toFixed(2) || '0.00'}</div>
            <p className="text-xs text-muted-foreground">Start of day</p>
          </CardContent>
        </Card>

        <Card data-testid="expected-cash-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expected Cash</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{session?.expected_cash?.toFixed(2) || '0.00'}</div>
            <p className="text-xs text-muted-foreground">In drawer</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="payment-breakdown-card">
          <CardHeader>
            <CardTitle>Payment Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Cash</span>
                <Badge variant="secondary">₹{report?.payment_breakdown?.cash?.toFixed(2) || '0.00'}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Card</span>
                <Badge variant="secondary">₹{report?.payment_breakdown?.card?.toFixed(2) || '0.00'}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">UPI</span>
                <Badge variant="secondary">₹{report?.payment_breakdown?.upi?.toFixed(2) || '0.00'}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="popular-items-card">
          <CardHeader>
            <CardTitle>Popular Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report?.popular_items?.slice(0, 5).map(([item, count], index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-sm">{item}</span>
                  <Badge>{count}x</Badge>
                </div>
              )) || <p className="text-sm text-gray-500">No data yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Open Session Dialog */}
      <Dialog open={showOpenSession} onOpenChange={setShowOpenSession}>
        <DialogContent data-testid="open-session-dialog">
          <DialogHeader>
            <DialogTitle>Open Day Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="opening-cash">Opening Cash Amount (₹)</Label>
              <Input
                id="opening-cash"
                type="number"
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="Enter opening cash"
                data-testid="opening-cash-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOpenSession(false)}>Cancel</Button>
            <Button onClick={handleOpenSession} disabled={!openingCash} data-testid="confirm-open-session">
              Open Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Session Dialog */}
      <Dialog open={showCloseSession} onOpenChange={setShowCloseSession}>
        <DialogContent data-testid="close-session-dialog">
          <DialogHeader>
            <DialogTitle>Close Day Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Expected Cash:</span>
                <span className="font-semibold">₹{session?.expected_cash?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Opening Cash:</span>
                <span>₹{session?.opening_cash?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Total Sales:</span>
                <span>₹{session?.total_sales?.toFixed(2)}</span>
              </div>
            </div>
            <div>
              <Label htmlFor="closing-cash">Actual Cash in Drawer (₹)</Label>
              <Input
                id="closing-cash"
                type="number"
                step="0.01"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                placeholder="Count and enter cash"
                data-testid="closing-cash-input"
              />
            </div>
            {closingCash && (
              <div className={`p-3 rounded-lg ${cashDifference >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <p className="text-sm font-medium">
                  Difference: 
                  <span className={cashDifference >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {' '}₹{Math.abs(parseFloat(closingCash) - (session?.expected_cash || 0)).toFixed(2)}
                  </span>
                  {cashDifference >= 0 ? ' (Surplus)' : ' (Shortage)'}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseSession(false)}>Cancel</Button>
            <Button onClick={handleCloseSession} disabled={!closingCash} data-testid="confirm-close-session">
              Close Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
