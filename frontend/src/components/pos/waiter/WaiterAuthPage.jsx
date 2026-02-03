import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Smartphone, 
  Wifi, 
  WifiOff, 
  CheckCircle, 
  AlertCircle,
  RefreshCw,
  User
} from 'lucide-react';
import { waiterDeviceLogin } from '@/utils/api';
import { saveUser } from '@/utils/storage';

export const WaiterAuthPage = ({ onAuthSuccess }) => {
  const [deviceId, setDeviceId] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [authStatus, setAuthStatus] = useState('checking'); // checking, not_authenticated, authenticated, error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deviceInfo, setDeviceInfo] = useState({});

  useEffect(() => {
    // Generate or retrieve device ID
    generateDeviceId();
    
    // Get device info
    getDeviceInfo();
    
    // Check online status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (deviceId && isOnline) {
      checkAuthentication();
    }
  }, [deviceId, isOnline]);

  const generateDeviceId = () => {
    let storedDeviceId = localStorage.getItem('waiter_device_id');
    
    if (!storedDeviceId) {
      // Generate unique device ID based on browser fingerprint
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Device fingerprint', 2, 2);
      
      const fingerprint = canvas.toDataURL();
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2);
      
      storedDeviceId = `waiter_${timestamp}_${random}_${btoa(fingerprint).substring(0, 8)}`;
      localStorage.setItem('waiter_device_id', storedDeviceId);
    }
    
    setDeviceId(storedDeviceId);
  };

  const getDeviceInfo = () => {
    const info = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
      isTablet: /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent)
    };
    
    setDeviceInfo(info);
  };

  const checkAuthentication = async () => {
    if (!isOnline) {
      setAuthStatus('error');
      setError('No internet connection. Please connect to WiFi.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const response = await waiterDeviceLogin(deviceId);
      
      if (response.user) {
        setAuthStatus('authenticated');
        saveUser(response.user);
        onAuthSuccess(response.user);
      }
    } catch (error) {
      console.error('Authentication check failed:', error);
      
      if (error.response?.status === 401) {
        setAuthStatus('not_authenticated');
        setError('This device is not authenticated. Please ask your manager to authenticate this device.');
      } else {
        setAuthStatus('error');
        setError('Connection failed. Please check your internet connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const retryAuthentication = () => {
    setAuthStatus('checking');
    checkAuthentication();
  };

  const getDeviceTypeIcon = () => {
    if (deviceInfo.isMobile) return <Smartphone className="w-8 h-8 text-blue-600" />;
    if (deviceInfo.isTablet) return <Smartphone className="w-8 h-8 text-blue-600" />;
    return <Smartphone className="w-8 h-8 text-blue-600" />;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'authenticated': return 'text-green-600';
      case 'not_authenticated': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'authenticated': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'not_authenticated': return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-600" />;
      default: return <RefreshCw className="w-5 h-5 text-gray-600 animate-spin" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            {getDeviceTypeIcon()}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Waiter Interface</h1>
          <p className="text-gray-600">Authenticating your device...</p>
        </div>

        {/* Main Card */}
        <Card className="shadow-lg">
          <CardHeader className="text-center pb-4">
            <CardTitle className="flex items-center justify-center space-x-2">
              {getStatusIcon(authStatus)}
              <span className={getStatusColor(authStatus)}>
                {authStatus === 'checking' && 'Checking Authentication...'}
                {authStatus === 'authenticated' && 'Device Authenticated'}
                {authStatus === 'not_authenticated' && 'Authentication Required'}
                {authStatus === 'error' && 'Connection Error'}
              </span>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Connection Status */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                {isOnline ? (
                  <Wifi className="w-4 h-4 text-green-600" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-600" />
                )}
                <span className="text-sm font-medium">
                  {isOnline ? 'Connected' : 'Offline'}
                </span>
              </div>
              <Badge variant={isOnline ? 'default' : 'destructive'}>
                {isOnline ? 'Online' : 'Offline'}
              </Badge>
            </div>

            {/* Device Info */}
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Device Type:</span>
                <span className="font-medium">
                  {deviceInfo.isMobile ? 'Mobile' : deviceInfo.isTablet ? 'Tablet' : 'Desktop'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Device ID:</span>
                <span className="font-mono text-xs">
                  {deviceId.substring(0, 12)}...
                </span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Authentication Instructions */}
            {authStatus === 'not_authenticated' && (
              <Alert>
                <User className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">Authentication Required</p>
                    <p className="text-sm">
                      Please ask your manager to:
                    </p>
                    <ol className="text-sm list-decimal list-inside space-y-1 ml-2">
                      <li>Open the Master Interface</li>
                      <li>Go to "Staff Management"</li>
                      <li>Select your name</li>
                      <li>Click "Authenticate Device"</li>
                      <li>Enter your 4-digit PIN</li>
                    </ol>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              {(authStatus === 'error' || authStatus === 'not_authenticated') && (
                <Button
                  onClick={retryAuthentication}
                  disabled={loading || !isOnline}
                  className="w-full"
                  size="lg"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Try Again
                    </>
                  )}
                </Button>
              )}

              {authStatus === 'authenticated' && (
                <Button className="w-full" size="lg" disabled>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Authenticated - Loading...
                </Button>
              )}
            </div>

            {/* Help Text */}
            <div className="text-center text-xs text-gray-500 pt-4 border-t">
              <p>Having trouble? Ask your manager for help.</p>
              <p className="mt-1">Device authentication is required only once.</p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-gray-500">
          <p>Cafe POS - Waiter Interface</p>
          <p>Secure device authentication system</p>
        </div>
      </div>
    </div>
  );
};