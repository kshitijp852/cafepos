import { get, set } from "idb-keyval";

import { api } from "@/api/client";
import { getToken } from "@/auth/storage";

// Per-device invoice-serial series (offline-safe bill numbering).
//
// Each install owns one series code (e.g. "C") claimed once from the server, and
// a locally-cached block of contiguous serials reserved from that series. Bills
// draw their serial from the block — online or offline — so two devices never
// produce the same invoice serial. Blocks are only refilled once fully drained,
// which keeps each series strictly consecutive (no gaps). Refilling needs
// connectivity, so a device must bill (or prewarm) online once before it can
// bill through an outage; the block size gives a healthy offline buffer.

const SERIES_KEY = "pos_bill_series"; // localStorage: this device's series code
const POOL_KEY = "pos_serial_pool"; // IndexedDB: the reserved block cursor
const BLOCK = 100;

interface SerialPool {
  series: string;
  next: number; // next serial to hand out
  end: number; // last serial in the reserved block (inclusive)
}

function readSeriesCode(): string | null {
  try {
    return localStorage.getItem(SERIES_KEY);
  } catch {
    return null;
  }
}

function writeSeriesCode(code: string) {
  try {
    localStorage.setItem(SERIES_KEY, code);
  } catch {
    /* ignore */
  }
}

async function claimSeries(preferred?: string): Promise<string> {
  const existing = readSeriesCode();
  if (existing) return existing;
  const { data } = await api.post<{ series_code: string }>("/bills/series/claim", { preferred });
  writeSeriesCode(data.series_code);
  return data.series_code;
}

async function reserveBlock(series: string): Promise<SerialPool> {
  const { data } = await api.post<{ series_code: string; start: number; end: number }>(
    "/bills/series/reserve",
    { series_code: series, count: BLOCK },
  );
  const pool: SerialPool = { series, next: data.start, end: data.end };
  await set(POOL_KEY, pool);
  return pool;
}

/**
 * Ensure this device has a claimed series and a non-empty serial block. Needs
 * connectivity (claims/reserves from the server). Safe to call opportunistically
 * while online to keep the offline buffer topped up. No-op if not signed in.
 */
export async function prewarmSerials(preferred?: string): Promise<void> {
  if (!getToken()) return;
  const series = await claimSeries(preferred);
  const pool = (await get(POOL_KEY)) as SerialPool | undefined;
  if (!pool || pool.series !== series || pool.next > pool.end) {
    await reserveBlock(series);
  }
}

/**
 * Hand out the next invoice serial for this device, refilling the block when it
 * is exhausted. Throws if a refill is needed but the device is offline (no
 * serials left to bill with) — the caller should surface that to the user.
 */
export async function drawSerial(): Promise<{ series: string; bill_number: number }> {
  const code = await claimSeries(); // returns cached code offline; only hits network on first ever call
  let pool = (await get(POOL_KEY)) as SerialPool | undefined;
  if (!pool || pool.series !== code || pool.next > pool.end) {
    // Exhausted / uninitialized — needs a fresh block (online only).
    pool = await reserveBlock(code);
  }
  const bill_number = pool.next;
  await set(POOL_KEY, { ...pool, next: pool.next + 1 });
  return { series: pool.series, bill_number };
}
