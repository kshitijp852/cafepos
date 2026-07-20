import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CaretUp, ForkKnife, PaperPlaneTilt, Trash } from "@phosphor-icons/react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import { createOrder, printKOT, updateOrder, updateOrderStatus } from "@/api/endpoints";
import { useActiveOrders, useCafe, useCategories, useInvalidate, useMenuItems, useTables } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { OfflineStatus } from "@/components/OfflineStatus";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { CartPanel } from "@/features/cart/CartPanel";
import { MenuBrowser } from "@/features/cart/MenuBrowser";
import { useCart } from "@/features/cart/useCart";
import { inr } from "@/lib/format";
import { isNetworkError } from "@/lib/offlineQueue";
import { printKitchenTicket } from "@/lib/printer";
import { cn } from "@/lib/utils";
import type { Order, OrderItem, Table } from "@/lib/types";

/** Combine two carts, summing quantities for the same menu item. */
function mergeItems(base: OrderItem[], extra: OrderItem[]): OrderItem[] {
  const merged = base.map((i) => ({ ...i }));
  for (const item of extra) {
    const match = merged.find((i) => i.menu_item_id === item.menu_item_id);
    if (match) match.quantity += item.quantity;
    else merged.push({ ...item });
  }
  return merged;
}

/**
 * What's in `current` that wasn't already sent in `fired` — the items this round
 * adds. A KOT must only ever list the new round, or the kitchen cooks twice.
 */
function newItems(current: OrderItem[], fired: OrderItem[]): OrderItem[] {
  const delta: OrderItem[] = [];
  for (const item of current) {
    const before = fired.find((i) => i.menu_item_id === item.menu_item_id)?.quantity ?? 0;
    if (item.quantity > before) delta.push({ ...item, quantity: item.quantity - before });
  }
  return delta;
}

/**
 * Print the KOT for one round on the device's own thermal printer, which works
 * during an outage. Never fatal: the order is already saved, so a printer
 * problem must only warn.
 *
 * There is no real server-side fallback — POST /printer/kot is still a mock that
 * only logs (backend/app/routers/printer.py). It is called so the ticket is at
 * least recorded, but the waiter is always told that no paper came out.
 */
async function printTicket(order: Order, round: OrderItem[], tableName?: string | null) {
  try {
    await printKitchenTicket({ ...order, items: round }, { tableName });
    return;
  } catch {
    /* no local printer paired or it failed mid-write */
  }
  await printKOT(order.id).catch(() => undefined);
  toast.warning("Order saved, but no ticket printed — tell the kitchen.");
}

export function WaiterOrderPage() {
  const { tableId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  const { data: menuItems = [] } = useMenuItems();
  const { data: categories = [] } = useCategories();
  const { data: tables = [] } = useTables();
  const { data: cafe } = useCafe();
  const { orders } = useActiveOrders();

  // No tableId is a counter/take-away order: fired to the kitchen like any
  // other, but the customer pays at the till because devices never settle.
  const isDineIn = !!tableId;

  const table: Table | undefined =
    (location.state as { table?: Table } | null)?.table ?? tables.find((t) => t.id === tableId);

  // The table's open order, if any. One open order per table is the system's
  // model (the backend stamps table.current_order_id and /reconcile flags
  // duplicates), so a second round edits this order rather than creating another.
  // Take-away has no table to key off, so every counter order is its own ticket.
  const existingOrder = isDineIn ? orders.find((o) => o.table_id === tableId) : undefined;

  // Tax comes from cafe settings as a CGST + SGST split, same as the counter.
  const taxPct = (cafe?.cgst_percentage ?? 0) + (cafe?.sgst_percentage ?? 0);

  const cart = useCart();
  const [hydrated, setHydrated] = useState(false);
  const [sending, setSending] = useState(false);
  const [serving, setServing] = useState(false);
  // Phone layout only: the cart overlays the menu instead of splitting the width.
  const [cartOpen, setCartOpen] = useState(false);
  // Items already sent to the kitchen, so the next KOT prints only the new round.
  const [fired, setFired] = useState<OrderItem[]>([]);

  // Seed the cart from the table's open order, once. The order can arrive after
  // the waiter has already tapped a few items, so merge rather than overwrite —
  // resetting would silently drop either their taps or the earlier round.
  useEffect(() => {
    if (!existingOrder || hydrated) return;
    cart.reset(mergeItems(existingOrder.items, cart.items));
    setFired(existingOrder.items);
    setHydrated(true);
  }, [existingOrder, hydrated, cart]);

  const cartTotal = cart.subtotal + cart.subtotal * (taxPct / 100);

  // What this send would fire: everything not already with the kitchen.
  const round = newItems(cart.items, fired);

  const send = async () => {
    if (sending) return; // guard a fast double-tap before `sending` flushes
    if (cart.count === 0) return toast.error("Add items to the order");
    if (round.length === 0) return toast.error("Nothing new to send");

    setSending(true);
    try {
      let order: Order;
      if (existingOrder) {
        try {
          order = await updateOrder(existingOrder.id, cart.items);
        } catch (err) {
          // Order edits aren't queued yet (the offline queue only replays POSTs),
          // so when the device is offline fall back to firing a new order. It is
          // queued idempotently and the manager reconciles the pair on sync.
          if (!isNetworkError(err)) throw err;
          order = await createOrder({ table_id: tableId, items: cart.items, status: "pending" });
          toast.info("Saved offline — your manager will merge it when this device syncs.");
        }
      } else {
        // Waiter attribution is stamped server-side from the device's assignment.
        order = await createOrder({ table_id: tableId, items: cart.items, status: "pending" });
      }

      // The ticket covers this round only, so the kitchen never re-cooks.
      await printTicket(order, round, table?.name);

      // The kitchen now has the ticket, so the order is being prepared. Only a
      // fresh order needs moving — a second round is already past this point.
      if (order.status === "pending" || order.status === "active") {
        await updateOrderStatus(order.id, "preparing").catch(() => undefined);
      }

      await invalidate(["orders", "tables"]);
      toast.success(isDineIn ? `Order sent for ${table?.name ?? "table"}` : "Take-away order sent");
      navigate("/waiter/tables");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to send order"));
    } finally {
      setSending(false);
    }
  };

  // Once the food is on the table the order is "ready" — the manager's alerts
  // read that as ready to settle. Settling itself stays with the manager.
  const markServed = async () => {
    if (!existingOrder) return;
    setServing(true);
    try {
      await updateOrderStatus(existingOrder.id, "ready");
      await invalidate(["orders", "tables"]);
      toast.success("Marked served — ready to settle");
      navigate("/waiter/tables");
    } catch (err) {
      toast.error(errorMessage(err, "Could not mark it served"));
    } finally {
      setServing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex h-16 items-center gap-3 border-b border-border bg-card px-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/waiter/tables")}>
          <ArrowLeft size={18} />
          Tables
        </Button>
        <div className="min-w-0">
          <h1 className="truncate font-heading text-xl font-bold leading-tight">
            {isDineIn ? `Table ${table?.name ?? tableId}` : "Take Away"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {!isDineIn ? "Counter · pay at the till" : existingOrder ? "Adding to the open order" : "New order"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {existingOrder && <OrderStatusBadge status={existingOrder.status} />}
          {existingOrder?.status === "preparing" && (
            <Button variant="outline" size="sm" onClick={markServed} disabled={serving}>
              <ForkKnife size={16} />
              <span className="hidden sm:inline">{serving ? "Saving…" : "Mark served"}</span>
            </Button>
          )}
          <OfflineStatus />
        </div>
      </header>

      {/* On a phone the menu owns the screen and the cart slides over it — a
          side-by-side split leaves neither usable at that width. */}
      <div className="flex min-h-0 flex-1">
        <div className={cn("min-h-0 flex-1 overflow-hidden md:border-r", cartOpen && "hidden md:block")}>
          <MenuBrowser items={menuItems} categories={categories} onAdd={cart.add} onlyAvailable />
        </div>
        <div className={cn("min-h-0 w-full flex-col md:flex md:w-96", cartOpen ? "flex" : "hidden")}>
          <CartPanel
            items={cart.items}
            subtotal={cart.subtotal}
            taxPercentage={taxPct}
            onInc={cart.inc}
            onDec={cart.dec}
            onRemove={cart.remove}
            onNotes={cart.setNotes}
            showNotes
            footer={
              <>
                <Button
                  variant="success"
                  className="w-full"
                  size="lg"
                  onClick={send}
                  disabled={sending || round.length === 0}
                >
                  <PaperPlaneTilt size={18} />
                  {sending
                    ? "Sending…"
                    : existingOrder
                      ? `Send ${round.length} new item${round.length === 1 ? "" : "s"}`
                      : "Send to Kitchen"}
                </Button>
                {/* Only a not-yet-sent order can be cleared here. Pulling an item
                    the kitchen is already cooking is a manager action. */}
                {!existingOrder && cart.count > 0 && (
                  <Button variant="ghost" className="w-full text-danger" onClick={cart.clear}>
                    <Trash size={16} />
                    Clear
                  </Button>
                )}
                <Button variant="ghost" className="w-full md:hidden" onClick={() => setCartOpen(false)}>
                  Back to menu
                </Button>
              </>
            }
          />
        </div>
      </div>

      {/* Phone-only running total; doubles as the way into the cart. */}
      {!cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          disabled={cart.count === 0}
          className="flex h-16 shrink-0 items-center justify-between border-t border-border bg-card px-4 disabled:text-muted-foreground md:hidden"
        >
          <span className="text-sm font-medium uppercase tracking-wide">
            {cart.count === 0 ? "No items yet" : `${cart.count} item${cart.count === 1 ? "" : "s"}`}
          </span>
          <span className="flex items-center gap-2">
            <span className="nums font-heading text-xl font-bold">{inr(cartTotal)}</span>
            <CaretUp size={18} weight="bold" />
          </span>
        </button>
      )}
    </div>
  );
}
