import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import type { Role } from "@/lib/types";

interface Props {
  allowedRoles?: Role[];
  redirectStaffToWaiter?: boolean;
}

export function RequireAuth({ allowedRoles, redirectStaffToWaiter }: Props) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (redirectStaffToWaiter && user.role === "staff") return <Navigate to="/waiter/tables" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/login" replace />;

  return <Outlet />;
}
