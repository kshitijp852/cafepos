import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowsLeftRight,
  ForkKnife,
  MagnifyingGlass,
  ShoppingBag,
  SignOut,
  WarningCircle,
} from "@phosphor-icons/react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import { transferTable, updateTable, waiterLogout } from "@/api/endpoints";
import { useActiveOrders, useDevice, useFloors, useInvalidate, useTables } from "@/api/queries";
import { useAuth } from "@/auth/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DwellTimer } from "@/components/DwellTimer";
import { OfflineStatus } from "@/components/OfflineStatus";
import { orderStatusLabel } from "@/components/OrderStatusBadge";
import { cn } from "@/lib/utils";
import { searchFloors } from "@/lib/search";
import type { Order, Table, TableStatus } from "@/lib/types";

const STATUS_STYLE: Record<TableStatus, string> = {
  available: "border-success/60 bg-success/20 text-foreground hover:bg-success/30",
  occupied: "border-warning bg-warning/10 text-foreground hover:bg-warning/20",
  reserved: "border-info/60 bg-info/15 text-foreground hover:bg-info/25",
};

export function WaiterTablesPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { data: tables = [], isLoading, isError, refetch, isFetching } = useTables();
  const { data: floors = [] } = useFloors();
  const { data: device } = useDevice();
  const { orders } = useActiveOrders();
  const assigned = device?.assigned_user?.name;
  const [query, setQuery] = useState("");
  const [actionsFor, setActionsFor] = useState<Table | null>(null);
  const groups = searchFloors(floors, tables, query);

  // Kitchen state per table, so the floor can see at a glance what's cooking and
  // what's been served and is waiting on a bill.
  const orderByTable = new Map(orders.filter((o) => o.table_id).map((o) => [o.table_id!, o]));

  const openTable = (table: Table) => navigate(`/waiter/order/${table.id}`, { state: { table } });

  const handleLogout = async () => {
    // Tell the backend so the manager panel shows this device as logged out.
    // Best-effort: sign out locally regardless of the network call.
    const deviceId = localStorage.getItem("waiter_device_id");
    if (deviceId) await waiterLogout(deviceId).catch(() => {});
    logout();
    navigate("/waiter", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate font-heading text-xl font-bold">{device?.device_name || "Café POS"}</h1>
          <Badge variant="outline" className="hidden sm:inline-flex">Waiter</Badge>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <OfflineStatus />
          <span className="hidden text-sm lg:block">
            {assigned ? (
              <>Waiter: <span className="font-medium">{assigned}</span></>
            ) : (
              <span className="text-muted-foreground">No waiter assigned</span>
            )}
          </span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <SignOut size={16} />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-11" onClick={() => navigate("/waiter/order")}>
            <ShoppingBag size={18} />
            Take away
          </Button>
          <Button variant="outline" className="h-11" onClick={() => navigate("/waiter/kitchen")}>
            <ForkKnife size={18} />
            Kitchen
          </Button>
          {tables.length > 0 && (
            <div className="relative ml-auto w-full sm:w-64">
              <MagnifyingGlass
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search table or floor…"
                className="h-11 pl-9"
              />
            </div>
          )}
        </div>

        {/* A failed fetch used to render as "no tables configured", which sends
            the waiter to their manager for a problem that is really the network. */}
        {isError ? (
          <div className="space-y-3 py-12 text-center">
            <WarningCircle size={32} className="mx-auto text-danger" />
            <p className="text-muted-foreground">Couldn&apos;t load your tables.</p>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Retrying…" : "Try again"}
            </Button>
          </div>
        ) : isLoading ? (
          <p className="py-12 text-center text-muted-foreground">Loading tables…</p>
        ) : floors.length === 0 && tables.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            No tables configured yet. Ask your manager to add tables.
          </p>
        ) : (
          groups.map(({ floor, tables: floorTables, highlight }) => (
            <section key={floor.id}>
              <h2
                className={cn(
                  "mb-3 inline-block text-sm font-semibold uppercase tracking-wide",
                  highlight ? "bg-accent px-2 py-0.5 text-foreground" : "text-muted-foreground",
                )}
              >
                {floor.name}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                {floorTables.map((table) => (
                  <TableTile
                    key={table.id}
                    table={table}
                    order={orderByTable.get(table.id)}
                    onOpen={() => openTable(table)}
                    onActions={() => setActionsFor(table)}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        {query && groups.length === 0 && !isLoading && !isError && (
          <p className="text-center text-muted-foreground">No tables or floors match “{query}”.</p>
        )}
      </main>

      <TableActionsDialog
        table={actionsFor}
        order={actionsFor ? orderByTable.get(actionsFor.id) : undefined}
        tables={tables}
        onClose={() => setActionsFor(null)}
        onDone={async () => {
          setActionsFor(null);
          await invalidate(["orders", "tables"]);
        }}
      />
    </div>
  );
}

function TableTile({
  table,
  order,
  onOpen,
  onActions,
}: {
  table: Table;
  order?: Order;
  onOpen: () => void;
  onActions: () => void;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-square flex-col items-center justify-center gap-1 border p-3 text-center transition-colors",
        STATUS_STYLE[table.status],
        // A served table is owed a bill — make it the loudest thing on the floor.
        order?.status === "ready" && "ring-2 ring-success ring-offset-1",
      )}
    >
      <button onClick={onOpen} className="absolute inset-0" aria-label={`Open table ${table.name}`} />
      <div className="pointer-events-none font-heading text-3xl font-bold">{table.name}</div>
      <div className="pointer-events-none text-[0.65rem] font-semibold uppercase leading-tight tracking-wide">
        {order ? orderStatusLabel(order.status) : table.status}
      </div>
      {table.seated_at ? (
        <DwellTimer seatedAt={table.seated_at} className="pointer-events-none text-[0.65rem] text-muted-foreground" />
      ) : (
        <div className="pointer-events-none text-[0.65rem] text-muted-foreground">{table.capacity} seats</div>
      )}

      {/* Sits above the full-tile button so the tile stays a single big target. */}
      <button
        onClick={onActions}
        aria-label={`Actions for table ${table.name}`}
        className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <ArrowsLeftRight size={16} />
      </button>
    </div>
  );
}

function TableActionsDialog({
  table,
  order,
  tables,
  onClose,
  onDone,
}: {
  table: Table | null;
  order?: Order;
  tables: Table[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    try {
      await fn();
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, failure));
    } finally {
      setBusy(false);
    }
  };

  const free = () =>
    run(async () => {
      await updateTable(table!.id, { status: "available", current_order_id: null });
      toast.success(`${table!.name} is free`);
    }, "Could not free that table");

  const move = (to: Table) =>
    run(async () => {
      await transferTable(table!.id, to.id);
      toast.success(`Moved ${table!.name} to ${to.name}`);
    }, "Could not move that table");

  // Only somewhere the sitting can actually go: free, and not this table.
  const destinations = tables.filter((t) => t.id !== table?.id && t.status === "available");

  return (
    <Dialog open={!!table} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Table {table?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {order ? (
            <>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Move this sitting to
                </p>
                {destinations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No free table to move to.</p>
                ) : (
                  <div className="grid max-h-52 grid-cols-4 gap-2 overflow-auto">
                    {destinations.map((t) => (
                      <Button
                        key={t.id}
                        variant="outline"
                        className="h-12"
                        disabled={busy}
                        onClick={() => move(t)}
                      >
                        {t.name}
                      </Button>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  The order and the seating time move with the guests.
                </p>
              </div>
              <p className="border-t border-border pt-4 text-xs text-muted-foreground">
                This table has an open order, so it can&apos;t be freed here — your manager frees it
                by settling the bill.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                No open order on this table.
              </p>
              {table?.status !== "available" && (
                <Button variant="outline" className="h-12 w-full" disabled={busy} onClick={free}>
                  {busy ? "Saving…" : "Mark table free"}
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
