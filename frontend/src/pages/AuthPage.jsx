import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { loginUser, registerUser } from '@/utils/api';
import { saveUser, saveToken } from '@/utils/storage';
import { toast } from 'sonner';
import { Coffee, ShoppingCart } from 'lucide-react';

export const AuthPage = ({ onAuthSuccess }) => {
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({ 
    email: '', 
    password: '', 
    name: '', 
    cafe_name: '' 
  });
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const response = await loginUser(loginData);
      saveUser(response.user);
      saveToken(response.token);
      toast.success('Login successful!');
      onAuthSuccess(response.user);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const user = await registerUser(registerData);
      
      // Auto-login after registration
      const loginResponse = await loginUser({
        email: registerData.email,
        password: registerData.password
      });
      
      saveUser(loginResponse.user);
      saveToken(loginResponse.token);
      toast.success('Registration successful!');
      onAuthSuccess(loginResponse.user);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md" data-testid="auth-card">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Coffee className="w-10 h-10 text-indigo-600" />
            <ShoppingCart className="w-10 h-10 text-indigo-600" />
          </div>
          <CardTitle className="text-3xl font-bold">Cafe POS System</CardTitle>
          <p className="text-gray-600 mt-2">Manage your restaurant efficiently</p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" data-testid="login-tab">Login</TabsTrigger>
              <TabsTrigger value="register" data-testid="register-tab">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4" data-testid="login-form">
                <div>
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    value={loginData.email}
                    onChange={(e) => setLoginData({...loginData, email: e.target.value})}
                    placeholder="owner@cafe.com"
                    required
                    data-testid="login-email-input"
                  />
                </div>
                <div>
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={loginData.password}
                    onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                    placeholder="••••••••"
                    required
                    data-testid="login-password-input"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loading}
                  data-testid="login-submit-button"
                >
                  {loading ? 'Logging in...' : 'Login'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4" data-testid="register-form">
                <div>
                  <Label htmlFor="cafe-name">Cafe Name</Label>
                  <Input
                    id="cafe-name"
                    value={registerData.cafe_name}
                    onChange={(e) => setRegisterData({...registerData, cafe_name: e.target.value})}
                    placeholder="My Awesome Cafe"
                    required
                    data-testid="cafe-name-input"
                  />
                </div>
                <div>
                  <Label htmlFor="owner-name">Your Name</Label>
                  <Input
                    id="owner-name"
                    value={registerData.name}
                    onChange={(e) => setRegisterData({...registerData, name: e.target.value})}
                    placeholder="John Doe"
                    required
                    data-testid="owner-name-input"
                  />
                </div>
                <div>
                  <Label htmlFor="register-email">Email</Label>
                  <Input
                    id="register-email"
                    type="email"
                    value={registerData.email}
                    onChange={(e) => setRegisterData({...registerData, email: e.target.value})}
                    placeholder="owner@cafe.com"
                    required
                    data-testid="register-email-input"
                  />
                </div>
                <div>
                  <Label htmlFor="register-password">Password</Label>
                  <Input
                    id="register-password"
                    type="password"
                    value={registerData.password}
                    onChange={(e) => setRegisterData({...registerData, password: e.target.value})}
                    placeholder="••••••••"
                    required
                    data-testid="register-password-input"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loading}
                  data-testid="register-submit-button"
                >
                  {loading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
