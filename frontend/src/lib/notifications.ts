import { useSyncExternalStore } from "react";

// A running log of every toast raised in the app, mirrored into the AlertsBell
// notification panel and persisted so it survives navigation/reload.
export type NotifKind = "success" | "error" | "warning" | "info";

export interface NotifEntry {
  id: string;
  kind: NotifKind;
  message: string;
  at: number; // epoch ms
  read: boolean;
}

const STORAGE_KEY = "pos_notifications";
const MAX = 50;

let entries: NotifEntry[] = load();
const listeners = new Set<() => void>();

function load(): NotifEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NotifEntry[]) : [];
  } catch {
    return [];
  }
}

function persistAndEmit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* ignore quota / private-mode failures */
  }
  listeners.forEach((l) => l());
}

export function pushNotification(kind: NotifKind, message: string) {
  const entry: NotifEntry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    message,
    at: Date.now(),
    read: false,
  };
  entries = [entry, ...entries].slice(0, MAX);
  persistAndEmit();
}

export function markNotificationsRead() {
  if (entries.every((e) => e.read)) return;
  entries = entries.map((e) => ({ ...e, read: true }));
  persistAndEmit();
}

export function clearNotifications() {
  if (entries.length === 0) return;
  entries = [];
  persistAndEmit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useNotifications(): NotifEntry[] {
  return useSyncExternalStore(subscribe, () => entries, () => entries);
}
