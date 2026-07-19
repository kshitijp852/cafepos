import type { User } from "@/lib/types";

// Two independent sessions can live in one browser: the manager app and the
// waiter device app. They use separate localStorage namespaces so signing in on
// one never clobbers the other. Scope is derived from the URL path.
type Scope = "manager" | "waiter";

const PREFIX: Record<Scope, string> = {
  manager: "pos_",
  waiter: "waiter_pos_",
};

export const scopeForPath = (path: string): Scope =>
  path.startsWith("/waiter") ? "waiter" : "manager";

const currentScope = (): Scope => scopeForPath(window.location.pathname);

const key = (name: string, scope: Scope) => `${PREFIX[scope]}${name}`;

export const getUser = (scope: Scope = currentScope()): User | null => {
  const raw = localStorage.getItem(key("user", scope));
  return raw ? (JSON.parse(raw) as User) : null;
};

export const getToken = (scope: Scope = currentScope()) =>
  localStorage.getItem(key("token", scope));

export const getRefreshToken = (scope: Scope = currentScope()) =>
  localStorage.getItem(key("refresh_token", scope));

export const saveSession = (
  user: User,
  token: string,
  refreshToken: string,
  scope: Scope = currentScope(),
) => {
  localStorage.setItem(key("user", scope), JSON.stringify(user));
  localStorage.setItem(key("token", scope), token);
  localStorage.setItem(key("refresh_token", scope), refreshToken);
};

export const setTokens = (
  token: string,
  refreshToken: string,
  scope: Scope = currentScope(),
) => {
  localStorage.setItem(key("token", scope), token);
  localStorage.setItem(key("refresh_token", scope), refreshToken);
};

export const clearAuth = (scope: Scope = currentScope()) => {
  localStorage.removeItem(key("user", scope));
  localStorage.removeItem(key("token", scope));
  localStorage.removeItem(key("refresh_token", scope));
};
