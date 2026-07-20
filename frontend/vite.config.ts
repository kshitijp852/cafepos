import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Auto-inject + auto-update the service worker. The app shell is precached
      // so the POS still loads with no internet; offline reads come from the
      // persisted React Query cache (see main.tsx), and offline writes from the
      // IndexedDB mutation queue (Phase 1) — the SW only caches the shell/assets,
      // not the cross-origin backend API.
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        navigateFallback: "index.html",
        // Never let the SW intercept API calls — those go straight to the axios
        // layer so the offline queue can see failures.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "Cafe POS",
        short_name: "POS",
        description: "Restaurant point of sale",
        theme_color: "#111111",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { port: 3000 },
});
