import { useSyncExternalStore } from "react";
import { get, set } from "idb-keyval";
import { AxiosError } from "axios";

import { api } from "@/api/client";
import { setOnline } from "@/lib/online";
import { pushNotification } from "@/lib/notifications";
import { prewarmSerials } from "@/lib/series";

// Offline write queue.
//
// When a POST fails because the device is offline (network error, no HTTP
// response), we persist the request in IndexedDB and resolve the caller
// optimistically so the UI keeps flowing. On reconnect the queue is drained in
// FIFO order. Every queued record carries a client-generated `id`, and the
// matching backend endpoints are idempotent by that id (create_order /
// create_bill), so replaying a request that actually did reach the server the
// first time returns the stored record instead of duplicating it.

const QUEUE_KEY = "pos_offline_queue";

export interface QueuedMutation {
  id: string; // the record's client id (also the idempotency key)
  url: string; // relative to the axios baseURL, e.g. "/orders"
  data: unknown;
  createdAt: number;
}

let draining = false;

// Reactive count of writes waiting to sync, so the UI can show "syncing N…".
let pending = 0;
const pendingListeners = new Set<() => void>();

function setPending(n: number) {
  if (n === pending) return;
  pending = n;
  pendingListeners.forEach((l) => l());
}

export function usePendingSync(): number {
  return useSyncExternalStore(
    (cb) => {
      pendingListeners.add(cb);
      return () => pendingListeners.delete(cb);
    },
    () => pending,
    () => 0,
  );
}

async function readQueue(): Promise<QueuedMutation[]> {
  return (await get(QUEUE_KEY)) ?? [];
}

async function writeQueue(q: QueuedMutation[]): Promise<void> {
  await set(QUEUE_KEY, q);
  setPending(q.length);
}

export async function queueLength(): Promise<number> {
  return (await readQueue()).length;
}

async function enqueue(entry: QueuedMutation): Promise<void> {
  const q = await readQueue();
  // Guard against enqueuing the same record twice (e.g. double-submit).
  if (q.some((e) => e.id === entry.id)) return;
  q.push(entry);
  await writeQueue(q);
}

// True when an axios error means "the request never reached the server" — as
// opposed to the server responding with a 4xx/5xx (which is a real, permanent
// answer we must not blindly retry forever).
export function isNetworkError(err: unknown): boolean {
  return err instanceof AxiosError && !err.response;
}

/**
 * POST that survives being offline. Ensures the payload has an `id`, attempts
 * the request, and on a network failure queues it and returns an optimistic
 * value built from `optimistic(id)`. Any real HTTP error is rethrown.
 */
export async function idempotentPost<T>(
  url: string,
  data: Record<string, unknown>,
  optimistic: (id: string) => T,
): Promise<T> {
  const id = (data.id as string) ?? crypto.randomUUID();
  const payload = { ...data, id };
  try {
    const resp = await api.post<T>(url, payload);
    setOnline(true);
    void drainQueue(); // opportunistically flush any earlier backlog
    return resp.data;
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueue({ id, url, data: payload, createdAt: Date.now() });
      setOnline(false);
      return optimistic(id);
    }
    throw err;
  }
}

/** Replay queued mutations in order. Stops on the first network failure. */
export async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    let q = await readQueue();
    setPending(q.length);
    while (q.length > 0) {
      const entry = q[0];
      try {
        await api.post(entry.url, entry.data);
        setOnline(true);
      } catch (err) {
        if (isNetworkError(err)) {
          setOnline(false);
          return; // still offline — leave the rest queued
        }
        // Server rejected it (4xx/5xx). Retrying can't fix it; drop it so the
        // queue can't wedge, and surface it so the sale isn't silently lost.
        pushNotification("error", "A saved order was rejected on sync and needs review.");
      }
      // Remove the processed head (succeeded or permanently rejected).
      q = (await readQueue()).filter((e) => e.id !== entry.id);
      await writeQueue(q);
    }
  } finally {
    draining = false;
  }
}

/** Wire up automatic replay + serial top-up: on reconnect and once at startup. */
export function initOfflineSync(): void {
  if (typeof window === "undefined") return;
  const onConnect = () => {
    void drainQueue();
    // Keep the offline invoice-serial buffer topped up while connected.
    void prewarmSerials().catch(() => undefined);
  };
  window.addEventListener("online", onConnect);
  onConnect();
}
