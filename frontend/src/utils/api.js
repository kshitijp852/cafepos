import axios from 'axios';
import { getToken } from './storage';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Axios interceptor — attach JWT to every request automatically
axios.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Axios interceptor — handle 401 globally (token expired)
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear stale auth and reload to login screen
      localStorage.removeItem('pos_user');
      localStorage.removeItem('pos_token');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const registerUser = async (data) => {
  const response = await axios.post(`${API}/auth/register`, data);
  return response.data;
};

export const loginUser = async (data) => {
  const response = await axios.post(`${API}/auth/login`, data);
  return response.data;
};

// Menu APIs — cafe_id now comes from JWT on the backend
export const getCategories = async () => {
  const response = await axios.get(`${API}/menu/categories`);
  return response.data;
};

export const createCategory = async (data) => {
  const response = await axios.post(`${API}/menu/categories`, data);
  return response.data;
};

export const updateCategory = async (categoryId, data) => {
  const response = await axios.put(`${API}/menu/categories/${categoryId}`, data);
  return response.data;
};

export const deleteCategory = async (categoryId) => {
  const response = await axios.delete(`${API}/menu/categories/${categoryId}`);
  return response.data;
};

export const getMenuItems = async () => {
  const response = await axios.get(`${API}/menu/items`);
  return response.data;
};

export const createMenuItem = async (data) => {
  const response = await axios.post(`${API}/menu/items`, data);
  return response.data;
};

export const updateMenuItem = async (itemId, data) => {
  const response = await axios.put(`${API}/menu/items/${itemId}`, data);
  return response.data;
};

export const deleteMenuItem = async (itemId) => {
  const response = await axios.delete(`${API}/menu/items/${itemId}`);
  return response.data;
};

// Table & Floor APIs
export const getFloors = async () => {
  const response = await axios.get(`${API}/floors`);
  return response.data;
};

export const createFloor = async (data) => {
  const response = await axios.post(`${API}/floors`, data);
  return response.data;
};

export const getTables = async () => {
  const response = await axios.get(`${API}/tables`);
  return response.data;
};

export const createTable = async (data) => {
  const response = await axios.post(`${API}/tables`, data);
  return response.data;
};

export const updateTable = async (tableId, data) => {
  const response = await axios.put(`${API}/tables/${tableId}`, data);
  return response.data;
};

// Order APIs
export const getOrders = async (status = 'active') => {
  const response = await axios.get(`${API}/orders?status=${status}`);
  return response.data;
};

export const createOrder = async (data) => {
  const response = await axios.post(`${API}/orders`, data);
  return response.data;
};

export const updateOrder = async (orderId, data) => {
  const response = await axios.put(`${API}/orders/${orderId}`, data);
  return response.data;
};

export const cancelOrder = async (orderId) => {
  const response = await axios.delete(`${API}/orders/${orderId}`);
  return response.data;
};

// Bill APIs
export const getBills = async (limit = 100, dateFilter = null) => {
  let url = `${API}/bills?limit=${limit}`;
  if (dateFilter) {
    url += `&date_filter=${dateFilter}`;
  }
  const response = await axios.get(url);
  return response.data;
};

export const getBill = async (billId) => {
  const response = await axios.get(`${API}/bills/${billId}`);
  return response.data;
};

export const createBill = async (data) => {
  const response = await axios.post(`${API}/bills`, data);
  return response.data;
};

// Reservation APIs
export const getReservations = async (dateFilter = null) => {
  let url = `${API}/reservations`;
  if (dateFilter) {
    url += `?date_filter=${dateFilter}`;
  }
  const response = await axios.get(url);
  return response.data;
};

export const createReservation = async (data) => {
  const response = await axios.post(`${API}/reservations`, data);
  return response.data;
};

export const updateReservation = async (reservationId, data) => {
  const response = await axios.put(`${API}/reservations/${reservationId}`, data);
  return response.data;
};

export const cancelReservation = async (reservationId) => {
  const response = await axios.delete(`${API}/reservations/${reservationId}`);
  return response.data;
};

// Day Session APIs
export const getCurrentSession = async () => {
  const response = await axios.get(`${API}/sessions/current`);
  return response.data;
};

export const openDaySession = async (data) => {
  const response = await axios.post(`${API}/sessions/open`, data);
  return response.data;
};

export const closeDaySession = async (data) => {
  const response = await axios.post(`${API}/sessions/close`, data);
  return response.data;
};

export const getSessionHistory = async () => {
  const response = await axios.get(`${API}/sessions/history`);
  return response.data;
};

// Reports APIs
export const getDailyReport = async (reportDate = null) => {
  let url = `${API}/reports/daily`;
  if (reportDate) {
    url += `?report_date=${reportDate}`;
  }
  const response = await axios.get(url);
  return response.data;
};

// Inventory APIs
export const getInventory = async () => {
  const response = await axios.get(`${API}/inventory`);
  return response.data;
};

export const createInventoryItem = async (data) => {
  const response = await axios.post(`${API}/inventory`, data);
  return response.data;
};

export const updateInventoryItem = async (itemId, data) => {
  const response = await axios.put(`${API}/inventory/${itemId}`, data);
  return response.data;
};

// Printer APIs (Mocked)
export const printBill = async (billId) => {
  const response = await axios.post(`${API}/printer/bill?bill_id=${billId}`);
  return response.data;
};

export const printKOT = async (orderId) => {
  const response = await axios.post(`${API}/printer/kot?order_id=${orderId}`);
  return response.data;
};
// Waiter Management APIs
export const getWaiters = async () => {
  const response = await axios.get(`${API}/waiters?cafe_id=${getCafeIdFromStorage()}`);
  return response.data;
};

export const createWaiter = async (data) => {
  const response = await axios.post(`${API}/waiters`, data);
  return response.data;
};

export const authenticateWaiterDevice = async (data) => {
  const response = await axios.post(`${API}/waiters/authenticate`, data);
  return response.data;
};

export const waiterDeviceLogin = async (deviceId) => {
  const response = await axios.post(`${API}/waiters/login?device_id=${deviceId}`);
  return response.data;
};

export const deactivateWaiter = async (waiterId) => {
  const response = await axios.delete(`${API}/waiters/${waiterId}`);
  return response.data;
};

export const getDeviceSessions = async () => {
  const response = await axios.get(`${API}/device-sessions?cafe_id=${getCafeIdFromStorage()}`);
  return response.data;
};

// Helper to get cafe_id from JWT token stored in localStorage
function getCafeIdFromStorage() {
  const token = localStorage.getItem('pos_token');
  if (!token) return '';
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return '';
    const decoded = JSON.parse(atob(parts[1]));
    return decoded.cafe_id || '';
  } catch (e) {
    return '';
  }
}