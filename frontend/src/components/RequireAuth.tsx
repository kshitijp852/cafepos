import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import type { Role } from "@/lib/types";

interface Props {
  allowedRoles?: Role[];
}

export function RequireAuth({ allowedRoles }: Props) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/login" replace />;

  return <Outlet />;
}
