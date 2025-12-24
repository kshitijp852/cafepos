import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth APIs
export const registerUser = async (data) => {
  const response = await axios.post(`${API}/auth/register`, data);
  return response.data;
};

export const loginUser = async (data) => {
  const response = await axios.post(`${API}/auth/login`, data);
  return response.data;
};

// Menu APIs
export const getCategories = async (cafeId) => {
  const response = await axios.get(`${API}/menu/categories?cafe_id=${cafeId}`);
  return response.data;
};

export const createCategory = async (data) => {
  const response = await axios.post(`${API}/menu/categories`, data);
  return response.data;
};

export const getMenuItems = async (cafeId) => {
  const response = await axios.get(`${API}/menu/items?cafe_id=${cafeId}`);
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
export const getFloors = async (cafeId) => {
  const response = await axios.get(`${API}/floors?cafe_id=${cafeId}`);
  return response.data;
};

export const createFloor = async (data) => {
  const response = await axios.post(`${API}/floors`, data);
  return response.data;
};

export const getTables = async (cafeId) => {
  const response = await axios.get(`${API}/tables?cafe_id=${cafeId}`);
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
export const getOrders = async (cafeId, status = 'active') => {
  const response = await axios.get(`${API}/orders?cafe_id=${cafeId}&status=${status}`);
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
export const getBills = async (cafeId, limit = 100, dateFilter = null) => {
  let url = `${API}/bills?cafe_id=${cafeId}&limit=${limit}`;
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
export const getReservations = async (cafeId, dateFilter = null) => {
  let url = `${API}/reservations?cafe_id=${cafeId}`;
  if (dateFilter) {
    url += `&date_filter=${dateFilter}`;
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
export const getCurrentSession = async (cafeId) => {
  const response = await axios.get(`${API}/sessions/current?cafe_id=${cafeId}`);
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

export const getSessionHistory = async (cafeId) => {
  const response = await axios.get(`${API}/sessions/history?cafe_id=${cafeId}`);
  return response.data;
};

// Reports APIs
export const getDailyReport = async (cafeId, reportDate = null) => {
  let url = `${API}/reports/daily?cafe_id=${cafeId}`;
  if (reportDate) {
    url += `&report_date=${reportDate}`;
  }
  const response = await axios.get(url);
  return response.data;
};

// Inventory APIs
export const getInventory = async (cafeId) => {
  const response = await axios.get(`${API}/inventory?cafe_id=${cafeId}`);
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
