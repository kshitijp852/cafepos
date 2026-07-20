import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ForkKnife } from "@phosphor-icons/react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import { updateOrderStatus } from "@/api/endpoints";
import { useActiveOrders, useInvalidate, useTables } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { DwellTimer } from "@/components/DwellTimer";
import { OfflineStatus } from "@/components/OfflineStatus";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/types";

// Kitchen display. Runs on the same paired device session as the waiter app
// (reading orders and advancing their status are both allowed there), so a
// tablet propped up on the pass becomes the kitchen screen with no extra login.
//
// This is what should own `preparing → ready`. Until a kitchen has a screen the
// waiter marks food served itself, which works but means the state only moves
// when someone walks back to the floor.

export function WaiterKitchenPage() {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  // Faster poll than the floor: the pass wants new tickets the moment they land.
  const { orders, isLoading } = useActiveOrders(5000);
  const { data: tables = [] } = useTables();
  const [busy, setBusy] = useState<string | null>(null);

  const tableName = (id: string | null | undefined) =>
    id ? tables.find((t) => t.id === id)?.name ?? "Table" : "Take away";

  // Oldest first — the pass works a queue, not a dashboard.
  const cooking = orders
    .filter((o) => o.status === "preparing")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const waiting = orders
    .filter((o) => o.status === "pending" || o.status === "active")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const advance = async (order: Order, to: "preparing" | "ready") => {
    setBusy(order.id);
    try {
      await updateOrderStatus(order.id, to);
      await invalidate(["orders", "tables"]);
    } catch (err) {
      toast.error(errorMessage(err, "Could not update that ticket"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center gap-3 border-b border-border bg-card px-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/waiter/tables")}>
          <ArrowLeft size={18} />
          Tables
        </Button>
        <h1 className="font-heading text-xl font-bold">Kitchen</h1>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {cooking.length} cooking · {waiting.length} waiting
          </span>
          <OfflineStatus />
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading && orders.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">Loading tickets…</p>
        ) : cooking.length === 0 && waiting.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            Nothing on the pass. New orders appear here automatically.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {[...waiting, ...cooking].map((order) => (
              <Ticket
                key={order.id}
                order={order}
                tableName={tableName(order.table_id)}
                busy={busy === order.id}
                onAdvance={advance}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Ticket({
  order,
  tableName,
  busy,
  onAdvance,
}: {
  order: Order;
  tableName: string;
  busy: boolean;
  onAdvance: (order: Order, to: "preparing" | "ready") => void;
}) {
  const cooking = order.status === "preparing";
  return (
    <section
      className={cn(
        "flex flex-col border border-border bg-card",
        // A ticket nobody has started is the one that needs attention.
        !cooking && "border-warning",
      )}
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-heading text-2xl font-bold leading-none">{tableName}</h2>
        <DwellTimer seatedAt={order.created_at} className="text-xs text-muted-foreground" />
      </header>

      <ul className="flex-1 space-y-2 px-4 py-3">
        {order.items.map((item) => (
          <li key={item.menu_item_id}>
            <div className="flex gap-2 text-sm">
              <span className="font-heading font-bold">{item.quantity}&times;</span>
              <span className="font-medium">{item.menu_item_name}</span>
            </div>
            {item.notes?.trim() && (
              // Instructions are the reason a ticket exists — never truncate them.
              <p className="mt-0.5 pl-6 text-xs font-medium text-warning">{item.notes}</p>
            )}
          </li>
        ))}
      </ul>

      <footer className="border-t border-border p-3">
        {cooking ? (
          <Button
            variant="success"
            size="lg"
            className="h-12 w-full"
            disabled={busy}
            onClick={() => onAdvance(order, "ready")}
          >
            <Check size={18} weight="bold" />
            {busy ? "Saving…" : "Ready"}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="lg"
            className="h-12 w-full"
            disabled={busy}
            onClick={() => onAdvance(order, "preparing")}
          >
            <ForkKnife size={18} />
            {busy ? "Saving…" : "Start cooking"}
          </Button>
        )}
      </footer>
    </section>
  );
}
