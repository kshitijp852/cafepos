import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";

import { clearAuth, getRefreshToken, getToken, scopeForPath, setTokens } from "@/auth/storage";

const BASE = `${import.meta.env.VITE_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: BASE });

// Attach the access token to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Extract a human-readable message from a backend error envelope ({"detail": ...}).
// `detail` is a string for HTTPExceptions, or an array of {msg} for 422 validation
// errors — handle both so the latter never renders as "[object Object]".
type ValidationItem = { msg?: string };
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  const detail = (err as AxiosError<{ detail?: string | ValidationItem[] }>)?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail.map((d) => d?.msg?.replace(/^Value error,\s*/, "")).filter(Boolean);
    if (msgs.length) return msgs.join(" ");
  }
  return fallback;
}

// On 401, transparently refresh the access token once, then replay the request.
// A single in-flight refresh is shared across concurrent 401s.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const resp = await axios.post(`${BASE}/auth/refresh`, { refresh_token: refreshToken });
    setTokens(resp.data.token, resp.data.refresh_token);
    return resp.data.token as string;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const isAuthCall = original?.url?.includes("/auth/");

    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      refreshPromise = refreshPromise ?? refreshAccessToken();
      const newToken = await refreshPromise;
      refreshPromise = null;

      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      // Refresh failed — force re-login into the correct app (waiter vs manager).
      clearAuth();
      const loginPath = scopeForPath(window.location.pathname) === "waiter" ? "/waiter" : "/login";
      if (window.location.pathname !== loginPath) window.location.assign(loginPath);
    }
    return Promise.reject(error);
  },
);
