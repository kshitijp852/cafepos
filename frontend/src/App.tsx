import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppLayout } from "@/components/AppLayout";
import { ErrorPage } from "@/components/ErrorPage";
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
import { ReconciliationPage } from "@/routes/ReconciliationPage";
import { AnalyticsPage } from "@/routes/AnalyticsPage";
import { CustomersPage } from "@/routes/CustomersPage";
import { InventoryPage } from "@/routes/InventoryPage";
import { SettingsPage } from "@/routes/SettingsPage";
import { ProfilePage } from "@/routes/ProfilePage";
import { AdminPlaceholderPage } from "@/routes/admin/AdminPlaceholderPage";
import { WaiterTablesPage } from "@/routes/waiter/WaiterTablesPage";
import { WaiterOrderPage } from "@/routes/waiter/WaiterOrderPage";
import { WaiterKitchenPage } from "@/routes/waiter/WaiterKitchenPage";

// Every branch gets an errorElement: a render error in one screen shows a
// recoverable error page instead of react-router's raw stack trace.
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage />, errorElement: <ErrorPage /> },
  { path: "/reset", element: <ResetPasswordPage />, errorElement: <ErrorPage /> },

  // Platform-admin app — placeholder landing until Slice 5 builds the real
  // cafe-approval dashboard.
  {
    element: <RequireAuth allowedRoles={["platform_admin"]} />,
    errorElement: <ErrorPage />,
    children: [{ path: "/admin", element: <AdminPlaceholderPage /> }],
  },

  // Waiter app — a waiter/kitchen staff member's own login, same session as
  // everyone else, routed here by role.
  {
    element: <RequireAuth allowedRoles={["waiter", "kitchen"]} />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/waiter/tables", element: <WaiterTablesPage /> },
      { path: "/waiter/kitchen", element: <WaiterKitchenPage /> },
      // No :tableId is a counter/take-away order. The waiter fires it to the
      // kitchen; the customer pays at the till, since devices never settle.
      { path: "/waiter/order", element: <WaiterOrderPage /> },
      { path: "/waiter/order/:tableId", element: <WaiterOrderPage /> },
    ],
  },

  // Manager app.
  {
    element: <RequireAuth allowedRoles={["owner", "manager"]} />,
    errorElement: <ErrorPage />,
    children: [
      // Ordering is full-screen (its own header, no app chrome) — a focused task.
      { path: "/order", element: <OrderPage /> },
      { path: "/order/:tableId", element: <OrderPage /> },
      { path: "/take-away", element: <Navigate to="/order" replace /> },
      {
        element: <AppLayout />,
        errorElement: <ErrorPage />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/menu", element: <MenuPage /> },
          { path: "/tables", element: <TablesPage /> },
          { path: "/staff", element: <StaffPage /> },
          { path: "/staff/:id", element: <StaffDetailPage /> },
          { path: "/reservations", element: <ReservationsPage /> },
          { path: "/analytics", element: <AnalyticsPage /> },
          { path: "/customers", element: <CustomersPage /> },
          { path: "/history", element: <HistoryPage /> },
          { path: "/reconcile", element: <ReconciliationPage /> },
          { path: "/inventory", element: <InventoryPage /> },
          { path: "/settings", element: <SettingsPage /> },
          { path: "/profile", element: <ProfilePage /> },
        ],
      },
    ],
  },

  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);
