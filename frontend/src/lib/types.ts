// Domain types mirroring the backend Pydantic models.

export type Role = "superadmin" | "owner" | "staff";
export type PaymentMethod = "cash" | "card" | "upi";
export type OrderStatus =
  | "pending"
  | "active"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";
export type TableStatus = "available" | "occupied" | "reserved";

export interface User {
  id: string;
  email: string;
  name: string;
  username?: string | null;
  phone?: string | null;
  role: Role;
  cafe_id: string;
  is_active?: boolean;
  created_at?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refresh_token: string;
}

export interface Category {
  id: string;
  name: string;
  cafe_id: string;
  created_at: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category_id: string;
  description?: string | null;
  image_url?: string | null;
  available: boolean;
  cafe_id: string;
}

export interface Floor {
  id: string;
  name: string;
  cafe_id: string;
}

export interface Cafe {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  gst_number?: string | null;
  tax_percentage: number;
}

export interface Table {
  id: string;
  name: string;
  code?: string | null;
  floor_id: string;
  capacity: number;
  status: TableStatus;
  cafe_id: string;
  current_order_id?: string | null;
  seated_at?: string | null;
}

export interface OrderItem {
  menu_item_id: string;
  menu_item_name: string;
  quantity: number;
  price: number;
  notes?: string;
  variants?: unknown[];
  addons?: unknown[];
}

export interface Order {
  id: string;
  cafe_id: string;
  table_id?: string | null;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  tax_percentage: number;
  total: number;
  status: OrderStatus;
  waiter_id?: string | null;
  waiter_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Bill {
  id: string;
  bill_number: number;
  cafe_id: string;
  table_id?: string | null;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  tax_percentage: number;
  total: number;
  payment_method: PaymentMethod;
  bill_hash: string;
  order_id?: string | null;
  dwell_seconds?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  created_at: string;
}

export interface Reservation {
  id: string;
  cafe_id: string;
  table_id: string;
  customer_name: string;
  customer_phone: string;
  guest_count: number;
  reservation_date: string;
  reservation_time: string;
  status: "confirmed" | "cancelled" | "completed";
  notes?: string | null;
  created_at: string;
}

export interface DaySession {
  id: string;
  cafe_id: string;
  session_date: string;
  opening_cash: number;
  closing_cash?: number | null;
  expected_cash?: number | null;
  total_sales: number;
  total_bills: number;
  status: "open" | "closed";
  opened_at: string;
  closed_at?: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  cafe_id: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  max_stock: number;
  cost_per_unit: number;
  last_restocked?: string | null;
}

export interface DailyReport {
  date: string;
  session: DaySession | null;
  total_bills: number;
  total_sales: number;
  payment_breakdown: Record<PaymentMethod, number>;
  popular_items: [string, number][];
}

export interface DeviceActivation {
  id: string;
  user_id?: string | null;
  cafe_id: string;
  device_id: string;
  code: string;
  device_name?: string | null;
  status: "pending" | "active";
  signed_in?: boolean;
  last_login?: string | null;
  last_logout?: string | null;
  assigned_user?: { id: string; name: string; username?: string } | null;
  created_at: string;
  activated_at?: string | null;
}
