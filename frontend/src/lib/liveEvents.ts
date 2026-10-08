// Live cafe updates over Server-Sent Events (GET /api/events/stream).
//
// Read with fetch (not EventSource) so the access token goes in the
// Authorization header instead of the URL. The stream reconnects with backoff;
// regular polling keeps the screens correct while it is down.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";

import { getBackendUrl } from "@/api/client";
import { getToken } from "@/auth/storage";
import { inr } from "@/lib/format";

export type LiveEvent =
  | { event: "bill_settled"; data: { bill_id: string; table_id: string | null; total: number; payment_method: string } }
  | {
      event: "payment_settled";
      data: {
        payment_id: string;
        payment_request_id: string | null;
        table_id: string | null;
        table_name: string | null;
        amount: number;
        bill_id: string;
      };
    }
  | {
      event: "payment_needs_review";
      data: { payment_id: string; amount: number; reason: string; candidate_table_ids: string[] };
    };

const listeners = new Set<(e: LiveEvent) => void>();

/** Subscribe to live events; returns an unsubscribe function. */
export function onLiveEvent(fn: (e: LiveEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function parseBlock(block: string): LiveEvent | null {
  let event = "";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!event || !data) return null;
  try {
    return { event, data: JSON.parse(data) } as LiveEvent;
  } catch {
    return null;
  }
}

async function readStream(signal: AbortSignal, onEvent: (e: LiveEvent) => void) {
  const token = getToken();
  if (!token) throw new Error("not signed in");
  const resp = await fetch(`${getBackendUrl()}/api/events/stream`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
    signal,
  });
  if (!resp.ok || !resp.body) throw new Error(`stream ${resp.status}`);
  const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += value;
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const ev = parseBlock(buf.slice(0, idx));
      buf = buf.slice(idx + 2);
      if (ev) onEvent(ev);
    }
  }
}

/** Mount once in the signed-in layout: keeps the stream open, refreshes the
 * affected queries on every event and announces UPI payments. */
export function useLiveEvents() {
  const qc = useQueryClient();

  useEffect(() => {
    const ctrl = new AbortController();
    let delay = 2000;

    const handle = (e: LiveEvent) => {
      for (const key of ["tables", "orders", "bills", "report", "payments"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      if (e.event === "payment_settled") {
        const where = e.data.table_name ? `Table ${e.data.table_name}` : "Counter order";
        toast.success(`${where} paid ${inr(e.data.amount)} via UPI`);
      } else if (e.event === "payment_needs_review") {
        toast.warning(`UPI payment of ${inr(e.data.amount)} received. Pick the table to close.`);
      }
      listeners.forEach((fn) => fn(e));
    };

    (async () => {
      while (!ctrl.signal.aborted) {
        try {
          await readStream(ctrl.signal, (e) => {
            delay = 2000;
            handle(e);
          });
        } catch {
          /* offline, token expired (refreshed by the next API call) or server restart */
        }
        if (ctrl.signal.aborted) return;
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 30000);
      }
    })();

    return () => ctrl.abort();
  }, [qc]);
}
