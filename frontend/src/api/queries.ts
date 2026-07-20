import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "./endpoints";
import type { Order, OrderStatus } from "@/lib/types";

export const keys = {
  categories: ["categories"] as const,
  menuItems: ["menuItems"] as const,
  floors: ["floors"] as const,
  tables: ["tables"] as const,
  orders: (status: OrderStatus) => ["orders", status] as const,
  bills: (limit: number, date?: string) => ["bills", limit, date ?? null] as const,
  reservations: (date?: string) => ["reservations", date ?? null] as const,
  inventory: ["inventory"] as const,
  currentSession: ["session", "current"] as const,
  sessionHistory: ["session", "history"] as const,
  dailyReport: (date?: string) => ["report", date ?? "today"] as const,
  waiters: ["waiters"] as const,
  waiterDevices: ["waiterDevices"] as const,
  cafe: ["cafe"] as const,
  device: ["device", "me"] as const,
  reconciliation: ["reconciliation"] as const,
};

// Conflicts left by offline replay (duplicate orders / double-settled bills).
export const useReconciliation = () =>
  useQuery({ queryKey: keys.reconciliation, queryFn: api.getReconciliation, refetchInterval: 15000 });

export const useCafe = () => useQuery({ queryKey: keys.cafe, queryFn: api.getCafe, staleTime: 300000 });

// Waiter app: current device name + assigned waiter, polled so manager reassignment shows up live.
export const useDevice = () =>
  useQuery({ queryKey: keys.device, queryFn: api.getDeviceMe, refetchInterval: 10000 });

export const useCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: api.getCategories });

export const useMenuItems = () =>
  useQuery({ queryKey: keys.menuItems, queryFn: api.getMenuItems });

export const useFloors = () => useQuery({ queryKey: keys.floors, queryFn: api.getFloors });

// Tables/orders drive the live floor view — poll for near-real-time updates.
export const useTables = () =>
  useQuery({ queryKey: keys.tables, queryFn: api.getTables, refetchInterval: 8000 });

export const useOrders = (status: OrderStatus = "active", refetchInterval = 8000) =>
  useQuery({ queryKey: keys.orders(status), queryFn: () => api.getOrders(status), refetchInterval });

const NON_TERMINAL: OrderStatus[] = ["pending", "active", "preparing", "ready"];

/** All non-terminal orders across every open status (dine-in + counter, any origin). */
export function useActiveOrders(refetchInterval = 8000) {
  const results = useQueries({
    queries: NON_TERMINAL.map((status) => ({
      queryKey: keys.orders(status),
      queryFn: () => api.getOrders(status),
      refetchInterval,
    })),
  });
  const orders: Order[] = results.flatMap((r) => r.data ?? []);
  return { orders, isLoading: results.some((r) => r.isLoading) };
}

export const useBills = (limit = 100, date?: string) =>
  useQuery({ queryKey: keys.bills(limit, date), queryFn: () => api.getBills(limit, date) });

export const useReservations = (date?: string) =>
  useQuery({ queryKey: keys.reservations(date), queryFn: () => api.getReservations(date) });

export const useInventory = () =>
  useQuery({ queryKey: keys.inventory, queryFn: api.getInventory });

export const useCurrentSession = () =>
  useQuery({ queryKey: keys.currentSession, queryFn: api.getCurrentSession });

export const useSessionHistory = () =>
  useQuery({ queryKey: keys.sessionHistory, queryFn: api.getSessionHistory });

export const useDailyReport = (date?: string) =>
  useQuery({ queryKey: keys.dailyReport(date), queryFn: () => api.getDailyReport(date) });

export const useWaiters = () => useQuery({ queryKey: keys.waiters, queryFn: api.getWaiters });

export const useWaiterDevices = () =>
  useQuery({ queryKey: keys.waiterDevices, queryFn: api.getWaiterDevices });

/** Invalidate several top-level query families at once after a mutation. */
export function useInvalidate() {
  const qc = useQueryClient();
  return (families: string[]) =>
    Promise.all(families.map((f) => qc.invalidateQueries({ queryKey: [f] })));
}
