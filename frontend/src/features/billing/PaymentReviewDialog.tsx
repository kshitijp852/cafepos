import { useState } from "react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import { assignPayment, dismissPayment, type ReviewReason, type UpiPayment } from "@/api/endpoints";
import { useInvalidate, usePaymentReviews, useTables } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr } from "@/lib/format";

const REASONS: Record<ReviewReason, string> = {
  multiple_matches: "More than one table has a bill for this amount.",
  no_match: "No open bill matches this amount.",
  amount_mismatch: "The amount paid doesn't match the bill's QR.",
  order_changed: "The order was edited after its QR was shown.",
  already_settled: "That bill was already settled.",
  stale_qr: "An old QR was paid after the bill was settled or re-issued.",
  unknown_reference: "The payment names a bill this cafe doesn't know.",
};

const SNOOZE_KEY = "cafepos.upiReviewSnoozed";

// "₹450 received! Which table?" — pops up for each UPI payment the server
// couldn't match to a single table on its own.
export function PaymentReviewDialog() {
  const { data: queue = [] } = usePaymentReviews();
  const { data: tables = [] } = useTables();
  const invalidate = useInvalidate();
  // Payments the user chose to look at later (this browser tab only).
  const [snoozed, setSnoozedState] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(SNOOZE_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const setSnoozed = (fn: (s: string[]) => string[]) =>
    setSnoozedState((prev) => {
      const next = fn(prev);
      try {
        sessionStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable: snooze lasts until reload */
      }
      return next;
    });
  const [busy, setBusy] = useState(false);

  const payment: UpiPayment | undefined = queue.find((p) => !snoozed.includes(p.id));
  const occupied = tables.filter((t) => t.status === "occupied");
  const candidates = payment ? occupied.filter((t) => payment.candidate_table_ids.includes(t.id)) : [];
  const others = payment ? occupied.filter((t) => !payment.candidate_table_ids.includes(t.id)) : [];

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update the payment"));
    } finally {
      await invalidate(["payments", "tables", "orders", "bills", "report"]);
      setBusy(false);
    }
  };

  if (!payment) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && setSnoozed((s) => [...s, payment.id])}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">UPI payment of {inr(payment.amount)} received</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {payment.review_reason ? REASONS[payment.review_reason] : "Pick the table this payment is for."}
            {" "}Txn {payment.transaction_id}
          </p>

          {candidates.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Select table to close</p>
              <div className="flex flex-wrap gap-2">
                {candidates.map((t) => (
                  <Button
                    key={t.id}
                    variant="success"
                    disabled={busy}
                    onClick={() => run(() => assignPayment(payment.id, t.id), `Table ${t.name} settled`)}
                  >
                    Table {t.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {candidates.length ? "Or another table" : "Occupied tables"}
              </p>
              <div className="flex flex-wrap gap-2">
                {others.map((t) => (
                  <Button
                    key={t.id}
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => run(() => assignPayment(payment.id, t.id), `Table ${t.name} settled`)}
                  >
                    {t.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 border-t border-border pt-4">
            <Button variant="ghost" className="flex-1" disabled={busy} onClick={() => setSnoozed((s) => [...s, payment.id])}>
              Later
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => run(() => dismissPayment(payment.id, "Not for an open table"), "Payment dismissed")}
            >
              Not for a table
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
