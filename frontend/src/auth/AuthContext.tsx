import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { AuthResponse, User } from "@/lib/types";
import { clearAuth, getToken, getUser, saveSession } from "./storage";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (auth: AuthResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialise from storage; require BOTH a user and a token to be considered logged in.
  const [user, setUser] = useState<User | null>(() => {
    const u = getUser();
    return u && getToken() ? u : null;
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      login: (auth) => {
        saveSession(auth.user, auth.token, auth.refresh_token);
        setUser(auth.user);
      },
      logout: () => {
        clearAuth();
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
