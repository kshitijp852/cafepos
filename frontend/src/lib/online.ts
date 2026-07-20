import { useSyncExternalStore } from "react";

// A tiny external store tracking whether the device currently has connectivity.
// Seeded from navigator.onLine and updated by the browser's online/offline
// events. The offline write queue (Phase 1) can also refine this via setOnline()
// when a real request succeeds or fails — navigator.onLine only knows about the
// network interface, not whether the backend is actually reachable.

let online = typeof navigator !== "undefined" ? navigator.onLine : true;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setOnline(next: boolean) {
  if (next === online) return;
  online = next;
  emit();
}

export function getOnline() {
  return online;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => setOnline(true));
  window.addEventListener("offline", () => setOnline(false));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// `true` is the server-snapshot fallback so SSR/first paint assumes connected.
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getOnline, () => true);
}
