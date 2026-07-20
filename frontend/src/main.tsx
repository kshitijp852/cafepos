import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { Persister } from "@tanstack/query-persist-client-core";
import { del, get, set } from "idb-keyval";
import { IconContext } from "@phosphor-icons/react";

// Self-hosted fonts (no runtime CDN).
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";

import { router } from "./App";
import { AuthProvider } from "@/auth/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import { initOfflineSync } from "@/lib/offlineQueue";
import "./index.css";

// Replay any writes queued during a previous offline session, and keep replaying
// whenever connectivity returns.
initOfflineSync();

// gcTime must be >= the persister maxAge, otherwise inactive queries are garbage
// collected before they can be restored, defeating offline reads.
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24h

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5000,
      gcTime: CACHE_MAX_AGE,
    },
  },
});

// Persist the React Query cache to IndexedDB so the last-known menu, tables and
// orders are readable when the device is offline (localStorage is too small for
// the full cache; IndexedDB via idb-keyval is the right store).
const idbPersister: Persister = {
  persistClient: (client) => set("pos_query_cache", client),
  restoreClient: () => get("pos_query_cache"),
  removeClient: () => del("pos_query_cache"),
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: idbPersister, maxAge: CACHE_MAX_AGE }}
    >
      <IconContext.Provider value={{ weight: "regular", size: 18 }}>
        <AuthProvider>
          <RouterProvider router={router} />
          <Toaster position="top-center" />
        </AuthProvider>
      </IconContext.Provider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
