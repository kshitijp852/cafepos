import { api } from "./client";
import type {
  AuthResponse,
  Bill,
  Cafe,
  Category,
  DailyReport,
  DaySession,
  DeviceActivation,
  Floor,
  InventoryItem,
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Reservation,
  Table,
  User,
} from "@/lib/types";

// ---- Auth ----
export type RegisterStartInput = {
  name: string;
  phone: string;
  email: string;
  cafe_name: string;
  password: string;
  confirm_password: string;
};

// Step 1: validate + email an OTP. `dev_otp` is only present when the backend
// has no SMTP configured (local dev), so the code can be shown without a mailbox.
export const registerStart = (d: RegisterStartInput) =>
  api
    .post<{ message: string; email: string; dev_otp?: string }>("/auth/register/start", d)
    .then((r) => r.data);

// Step 2: verify the OTP and receive the authenticated session.
export const registerVerify = (d: { email: string; otp: string }) =>
  api.post<AuthResponse>("/auth/register/verify", d).then((r) => r.data);

export const loginUser = (d: { email: string; password: string }) =>
  api.post<AuthResponse>("/auth/login", d).then((r) => r.data);

// Password reset — request a link, then confirm with the emailed token.
export const requestPasswordReset = (email: string) =>
  api
    .post<{ message: string; dev_reset_url?: string }>("/auth/reset/request", { email })
    .then((r) => r.data);

export const confirmPasswordReset = (d: { token: string; password: string; confirm_password: string }) =>
  api.post<{ message: string }>("/auth/reset/confirm", d).then((r) => r.data);

// ---- Menu ----
export const getCategories = () => api.get<Category[]>("/menu/categories").then((r) => r.data);
export const createCategory = (d: { name: string }) =>
  api.post<Category>("/menu/categories", d).then((r) => r.data);
export const updateCategory = (id: string, d: { name: string }) =>
  api.put<Category>(`/menu/categories/${id}`, d).then((r) => r.data);
export const deleteCategory = (id: string) =>
  api.delete(`/menu/categories/${id}`).then((r) => r.data);

export type MenuItemInput = {
  name: string;
  price: number;
  category_id: string;
  description?: string;
  available?: boolean;
};
export const getMenuItems = () => api.get<MenuItem[]>("/menu/items").then((r) => r.data);
export const createMenuItem = (d: MenuItemInput) =>
  api.post<MenuItem>("/menu/items", d).then((r) => r.data);
export const updateMenuItem = (id: string, d: MenuItemInput) =>
  api.put<MenuItem>(`/menu/items/${id}`, d).then((r) => r.data);
export const deleteMenuItem = (id: string) => api.delete(`/menu/items/${id}`).then((r) => r.data);

// Bulk-delete the whole menu, gated by an email OTP.
export const requestMenuPurge = () =>
  api
    .post<{ message: string; item_count: number; dev_otp?: string }>("/menu/purge/request")
    .then((r) => r.data);
export const confirmMenuPurge = (otp: string) =>
  api
    .post<{ message: string; deleted_items: number; deleted_categories: number }>("/menu/purge/confirm", { otp })
    .then((r) => r.data);

// ---- Floors / Tables ----
export const getFloors = () => api.get<Floor[]>("/floors").then((r) => r.data);
export const createFloor = (d: { name: string }) => api.post<Floor>("/floors", d).then((r) => r.data);
export const getTables = () => api.get<Table[]>("/tables").then((r) => r.data);
export const createTable = (d: { name: string; floor_id: string; capacity: number }) =>
  api.post<Table>("/tables", d).then((r) => r.data);
export const createTablesBulk = (d: {
  floor_id: string;
  count: number;
  capacity: number;
  prefix?: string;
  start?: number;
}) => api.post<Table[]>("/tables/bulk", d).then((r) => r.data);
export const updateTable = (id: string, d: Partial<Table>) =>
  api.put<Table>(`/tables/${id}`, d).then((r) => r.data);
export const deleteTable = (id: string) => api.delete(`/tables/${id}`).then((r) => r.data);

// ---- Orders ----
export type OrderInput = {
  table_id?: string | null;
  items: OrderItem[];
  waiter_id?: string | null;
  waiter_name?: string | null;
  status?: OrderStatus;
};
export const getOrders = (status: OrderStatus = "active") =>
  api.get<Order[]>(`/orders`, { params: { status } }).then((r) => r.data);
export const createOrder = (d: OrderInput) => api.post<Order>("/orders", d).then((r) => r.data);
export const updateOrder = (id: string, items: OrderItem[]) =>
  api.put<Order>(`/orders/${id}`, { items }).then((r) => r.data);
export const updateOrderStatus = (id: string, status: OrderStatus) =>
  api.put<Order>(`/orders/${id}/status`, { status }).then((r) => r.data);
export const cancelOrder = (id: string) => api.delete(`/orders/${id}`).then((r) => r.data);

// ---- Bills ----
export type BillInput = {
  table_id?: string | null;
  items: OrderItem[];
  tax_percentage?: number;
  payment_method: PaymentMethod;
  order_id?: string | null;
  customer_name?: string;
  customer_phone?: string;
};
export const getBills = (limit = 100, dateFilter?: string) =>
  api.get<Bill[]>("/bills", { params: { limit, date_filter: dateFilter } }).then((r) => r.data);
export const getBill = (id: string) => api.get<Bill>(`/bills/${id}`).then((r) => r.data);
export const createBill = (d: BillInput) => api.post<Bill>("/bills", d).then((r) => r.data);

// ---- Reservations ----
export type ReservationInput = {
  table_id: string;
  customer_name: string;
  customer_phone: string;
  guest_count: number;
  reservation_date: string;
  reservation_time: string;
  notes?: string;
};
export const getReservations = (dateFilter?: string) =>
  api.get<Reservation[]>("/reservations", { params: { date_filter: dateFilter } }).then((r) => r.data);
export const createReservation = (d: ReservationInput) =>
  api.post<Reservation>("/reservations", d).then((r) => r.data);
export const updateReservation = (id: string, d: Partial<Reservation>) =>
  api.put<Reservation>(`/reservations/${id}`, d).then((r) => r.data);
export const cancelReservation = (id: string) =>
  api.delete(`/reservations/${id}`).then((r) => r.data);

// ---- Day sessions ----
export const getCurrentSession = () =>
  api.get<DaySession | null>("/sessions/current").then((r) => r.data);
export const openDaySession = (d: { opening_cash: number }) =>
  api.post<DaySession>("/sessions/open", d).then((r) => r.data);
export const closeDaySession = (d: { session_id: string; closing_cash: number }) =>
  api.post<DaySession>("/sessions/close", d).then((r) => r.data);
export const getSessionHistory = () =>
  api.get<DaySession[]>("/sessions/history").then((r) => r.data);

// ---- Reports ----
export const getDailyReport = (reportDate?: string) =>
  api.get<DailyReport>("/reports/daily", { params: { report_date: reportDate } }).then((r) => r.data);

export type Analytics = {
  today: { revenue: number; bills: number; payment_breakdown: Record<string, number> };
  totals: { revenue: number; bills: number; avg_bill: number };
  payment_breakdown: Record<string, number>;
  top_items: [string, number][];
  trend_7d: { date: string; revenue: number }[];
  by_staff: { waiter_id: string; waiter_name: string; revenue: number; bills: number }[];
};
export const getAnalytics = () => api.get<Analytics>("/reports/analytics").then((r) => r.data);

// ---- Inventory ----
export type InventoryInput = {
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  max_stock: number;
  cost_per_unit: number;
};
export const getInventory = () => api.get<InventoryItem[]>("/inventory").then((r) => r.data);
export const createInventoryItem = (d: InventoryInput) =>
  api.post<InventoryItem>("/inventory", d).then((r) => r.data);
export const updateInventoryItem = (id: string, d: Partial<InventoryInput>) =>
  api.put<InventoryItem>(`/inventory/${id}`, d).then((r) => r.data);

// ---- Printer (mocked) ----
export const printBill = (billId: string) =>
  api.post(`/printer/bill`, null, { params: { bill_id: billId } }).then((r) => r.data);
export const printKOT = (orderId: string) =>
  api.post(`/printer/kot`, null, { params: { order_id: orderId } }).then((r) => r.data);

// ---- Cafe ----
export const getCafe = () => api.get<Cafe>("/cafe").then((r) => r.data);

// ---- Staff roster (names only — staff never log in; devices do) ----
export const getWaiters = () => api.get<User[]>("/waiters").then((r) => r.data);
export const createWaiter = (d: { name: string; username?: string }) =>
  api.post<User>("/waiters", d).then((r) => r.data);

// ---- Devices (device-code pairing; manager assigns the current waiter) ----
export type AssignedUser = { id: string; name: string; username?: string } | null;
export type DeviceInfo = { device_id: string; device_name?: string | null; assigned_user: AssignedUser };

// Device poll: pending until a manager activates it, then a device token pair.
export type DevicePollResult =
  | { status: "pending" }
  | { status: "active"; token: string; refresh_token: string; device: DeviceInfo };
export const requestDeviceCode = (device_id: string) =>
  api.post<{ code: string; expires_at: string }>("/waiters/devices/request", { device_id }).then((r) => r.data);
export const pollDeviceCode = (d: { device_id: string; code: string }) =>
  api.post<DevicePollResult>("/waiters/devices/poll", d).then((r) => r.data);

// Waiter app: the device's own name + currently assigned waiter (polled live).
export const getDeviceMe = () => api.get<DeviceInfo>("/devices/me").then((r) => r.data);

export const waiterLogout = (device_id: string) =>
  api.post("/waiters/devices/logout", { device_id }).then((r) => r.data);

// Manager: authorize a pending device by code (optionally name it + assign a waiter).
export const activateWaiterDevice = (d: { code: string; waiter_id?: string; device_name?: string }) =>
  api.post<{ success: boolean; message: string }>("/waiters/devices/activate", d).then((r) => r.data);

// Manager: set/clear the current waiter on a device and/or rename it.
export const assignDevice = (activationId: string, d: { user_id?: string | null; device_name?: string }) =>
  api.patch<DeviceActivation>(`/waiters/devices/${activationId}`, d).then((r) => r.data);

export const getWaiterDevices = () =>
  api.get<DeviceActivation[]>("/waiters/devices").then((r) => r.data);
export const revokeWaiterDevice = (id: string) =>
  api.delete(`/waiters/devices/${id}`).then((r) => r.data);

export type WaiterStats = {
  staff: User;
  orders_taken: number;
  tables_served: number;
  items_sold: number;
  bills_count: number;
  revenue: number;
  avg_bill: number;
  payment_breakdown: Record<string, number>;
  top_items: [string, number][];
  recent_bills: {
    id: string;
    bill_number: number;
    total: number;
    payment_method: string;
    table_id: string | null;
    created_at: string;
    item_count: number;
  }[];
  last_active: string | null;
};
export const getWaiterStats = (id: string) =>
  api.get<WaiterStats>(`/waiters/${id}/stats`).then((r) => r.data);

export const updateWaiter = (id: string, d: { name?: string; username?: string }) =>
  api.patch<User>(`/waiters/${id}`, d).then((r) => r.data);

export const deactivateWaiter = (id: string) =>
  api.post(`/waiters/${id}/deactivate`).then((r) => r.data);
export const reactivateWaiter = (id: string) =>
  api.post(`/waiters/${id}/activate`).then((r) => r.data);
export const deleteWaiter = (id: string) => api.delete(`/waiters/${id}`).then((r) => r.data);
