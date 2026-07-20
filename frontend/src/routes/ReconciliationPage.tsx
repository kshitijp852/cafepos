import { useState } from "react";
import { CheckCircle, WarningCircle, X } from "@phosphor-icons/react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import { resolveTableConflict, voidBill } from "@/api/endpoints";
import { useInvalidate, useReconciliation } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { formatBillNo, inr, timeAgo } from "@/lib/format";

// Manager view for conflicts left behind when offline tablets reconnect and
// their queued writes replay: two open orders on one table, or one order billed
// twice. Nothing is auto-dropped — the manager decides what to keep.
export function ReconciliationPage() {
  const { data, isLoading } = useReconciliation();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => invalidate(["reconciliation", "orders", "tables", "bills", "report"]);

  const keepOrder = async (tableId: string, orderId: string) => {
    setBusy(orderId);
    try {
      await resolveTableConflict(tableId, orderId);
      await refresh();
      toast.success("Table conflict resolved");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to resolve"));
    } finally {
      setBusy(null);
    }
  };

  const void_ = async (billId: string) => {
    setBusy(billId);
    try {
      await voidBill(billId, "duplicate (offline double-settle)");
      await refresh();
      toast.success("Duplicate bill voided");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to void bill"));
    } finally {
      setBusy(null);
    }
  };

  const tableConflicts = data?.duplicate_table_orders ?? [];
  const billConflicts = data?.double_settled_orders ?? [];
  const clean = !isLoading && (data?.count ?? 0) === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 lg:p-6">
      <header>
        <h1 className="font-heading text-2xl font-bold">Reconcile</h1>
        <p className="text-sm text-muted-foreground">
          Conflicts left after offline devices synced. Review and resolve — nothing is deleted automatically.
        </p>
      </header>

      {clean && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border py-16 text-center">
          <CheckCircle size={40} weight="fill" className="text-emerald-500" />
          <p className="font-medium">All synced — no conflicts.</p>
        </div>
      )}

      {tableConflicts.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <WarningCircle size={18} className="text-amber-500" />
            Tables with more than one open order
          </h2>
          {tableConflicts.map((tc) => (
            <div key={tc.table_id} className="rounded-lg border border-border p-4">
              <p className="mb-3 text-sm font-medium">Table {tc.table_name ?? tc.table_id}</p>
              <div className="space-y-2">
                {tc.orders.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {o.item_count} item{o.item_count === 1 ? "" : "s"} · {inr(o.total)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {o.waiter_name ? `${o.waiter_name} · ` : ""}
                        {timeAgo(o.created_at)}
                      </p>
                    </div>
                    <Button size="sm" disabled={busy !== null} onClick={() => keepOrder(tc.table_id, o.id)}>
                      Keep this
                    </Button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Keeping one order cancels the others on this table.
              </p>
            </div>
          ))}
        </section>
      )}

      {billConflicts.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <WarningCircle size={18} className="text-amber-500" />
            Orders billed more than once
          </h2>
          {billConflicts.map((bc) => (
            <div key={bc.order_id} className="rounded-lg border border-border p-4">
              <p className="mb-3 text-sm font-medium">Order settled {bc.bills.length} times</p>
              <div className="space-y-2">
                {bc.bills.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium nums">
                        #{formatBillNo(b)} · {inr(b.total)} · <span className="capitalize">{b.payment_method}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{timeAgo(b.created_at)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy !== null}
                      onClick={() => void_(b.id)}
                    >
                      <X size={14} /> Void
                    </Button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Void the duplicate(s); the kept bill stays on record. Voided bills are retained for audit.
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
