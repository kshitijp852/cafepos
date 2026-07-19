import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppLayout } from "@/components/AppLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { LoginPage } from "@/routes/LoginPage";
import { ResetPasswordPage } from "@/routes/ResetPasswordPage";
import { DashboardPage } from "@/routes/DashboardPage";
import { OrderPage } from "@/routes/OrderPage";
import { MenuPage } from "@/routes/MenuPage";
import { TablesPage } from "@/routes/TablesPage";
import { StaffPage } from "@/routes/StaffPage";
import { StaffDetailPage } from "@/routes/StaffDetailPage";
import { ReservationsPage } from "@/routes/ReservationsPage";
import { HistoryPage } from "@/routes/HistoryPage";
import { AnalyticsPage } from "@/routes/AnalyticsPage";
import { InventoryPage } from "@/routes/InventoryPage";
import { WaiterAuthPage } from "@/routes/waiter/WaiterAuthPage";
import { WaiterTablesPage } from "@/routes/waiter/WaiterTablesPage";
import { WaiterOrderPage } from "@/routes/waiter/WaiterOrderPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/reset", element: <ResetPasswordPage /> },
  { path: "/waiter", element: <WaiterAuthPage /> },

  // Waiter app (any authenticated user, typically staff).
  {
    element: <RequireAuth />,
    children: [
      { path: "/waiter/tables", element: <WaiterTablesPage /> },
      { path: "/waiter/order/:tableId", element: <WaiterOrderPage /> },
    ],
  },

  // Manager app.
  {
    element: <RequireAuth allowedRoles={["owner", "superadmin"]} redirectStaffToWaiter />,
    children: [
      // Ordering is full-screen (its own header, no app chrome) — a focused task.
      { path: "/order", element: <OrderPage /> },
      { path: "/order/:tableId", element: <OrderPage /> },
      { path: "/take-away", element: <Navigate to="/order" replace /> },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/menu", element: <MenuPage /> },
          { path: "/tables", element: <TablesPage /> },
          { path: "/staff", element: <StaffPage /> },
          { path: "/staff/:id", element: <StaffDetailPage /> },
          { path: "/reservations", element: <ReservationsPage /> },
          { path: "/analytics", element: <AnalyticsPage /> },
          { path: "/history", element: <HistoryPage /> },
          { path: "/inventory", element: <InventoryPage /> },
        ],
      },
    ],
  },

  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);
