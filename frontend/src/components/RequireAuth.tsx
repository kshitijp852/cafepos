import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { scopeForPath } from "@/auth/storage";
import type { Role } from "@/lib/types";

interface Props {
  allowedRoles?: Role[];
  redirectStaffToWaiter?: boolean;
}

export function RequireAuth({ allowedRoles, redirectStaffToWaiter }: Props) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  // Unauthenticated users are sent to the sign-in for the app they were trying to
  // reach — the waiter device app or the manager app.
  const loginPath = scopeForPath(pathname) === "waiter" ? "/waiter" : "/login";

  if (!user) return <Navigate to={loginPath} replace />;
  if (redirectStaffToWaiter && user.role === "staff") return <Navigate to="/waiter/tables" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to={loginPath} replace />;

  return <Outlet />;
}
