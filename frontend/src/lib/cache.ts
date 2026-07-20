import { del } from "idb-keyval";

/** IndexedDB key holding the persisted React Query cache. */
export const QUERY_CACHE_KEY = "pos_query_cache";

/**
 * Bump whenever a cached API response changes shape. The persister drops any
 * snapshot saved under a different buster, so a stale payload can never hydrate
 * into code that expects new fields.
 */
export const CACHE_VERSION = "2";

/** Drop the offline read-cache and reload — the escape hatch on the error page. */
export async function clearPersistedCache(): Promise<void> {
  try {
    await del(QUERY_CACHE_KEY);
  } catch {
    // Nothing recoverable to do — the reload below still gives a clean start.
  }
}
