import type { User } from "@/lib/types";

// One session per browser: every role (owner/manager/waiter/kitchen) signs in
// through the same login and gets one unqualified set of localStorage keys.
const KEY = {
  user: "pos_user",
  token: "pos_token",
  refresh_token: "pos_refresh_token",
};

export const getUser = (): User | null => {
  const raw = localStorage.getItem(KEY.user);
  return raw ? (JSON.parse(raw) as User) : null;
};

export const getToken = () => localStorage.getItem(KEY.token);

export const getRefreshToken = () => localStorage.getItem(KEY.refresh_token);

export const saveSession = (user: User, token: string, refreshToken: string) => {
  localStorage.setItem(KEY.user, JSON.stringify(user));
  localStorage.setItem(KEY.token, token);
  localStorage.setItem(KEY.refresh_token, refreshToken);
};

/** Refresh only the cached user record (e.g. after a profile edit). */
export const setStoredUser = (user: User) => {
  localStorage.setItem(KEY.user, JSON.stringify(user));
};

export const setTokens = (token: string, refreshToken: string) => {
  localStorage.setItem(KEY.token, token);
  localStorage.setItem(KEY.refresh_token, refreshToken);
};

export const clearAuth = () => {
  localStorage.removeItem(KEY.user);
  localStorage.removeItem(KEY.token);
  localStorage.removeItem(KEY.refresh_token);
};
