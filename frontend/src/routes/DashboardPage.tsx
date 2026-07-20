import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle, Circle, MagnifyingGlass } from "@phosphor-icons/react";

import {
  useActiveOrders,
  useDailyReport,
  useFloors,
  useMenuItems,
  useTables,
  useWaiters,
} from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DwellTimer } from "@/components/DwellTimer";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { searchFloors } from "@/lib/search";
import type { Order, Table } from "@/lib/types";

export function DashboardPage() {
  const { data: tables = [] } = useTables();
  const { data: floors = [] } = useFloors();
  const { orders } = useActiveOrders();
  const { data: menuItems = [] } = useMenuItems();
  const { data: waiters = [] } = useWaiters();
  const { data: report } = useDailyReport();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const orderFor = (t: Table) => orders.find((o) => o.table_id === t.id);
  const needsSetup = menuItems.length === 0 || tables.length === 0;
  const groups = searchFloors(floors, tables, query);

  return (
    <div className="flex h-full flex-col">
      {/* KPI strip */}
      <div className="grid grid-cols-2 border-b border-border md:grid-cols-4">
        <Kpi label="Bills Today" value={String(report?.total_bills ?? 0)} />
        <Kpi label="Revenue Today" value={inr(report?.total_sales ?? 0)} />
        <Kpi label="Cash Today" value={inr(report?.payment_breakdown?.cash ?? 0)} />
        <Kpi
          label="Card + UPI Today"
          value={inr((report?.payment_breakdown?.card ?? 0) + (report?.payment_breakdown?.upi ?? 0))}
        />
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-8">
        {needsSetup && (
          <SetupGuide
            menuDone={menuItems.length > 0}
            tablesDone={tables.length > 0}
            staffDone={waiters.length > 0}
            go={navigate}
          />
        )}

        {!needsSetup && tables.length > 0 && (
          <div className="relative max-w-sm">
            <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search table or floor…"
              className="pl-9"
            />
          </div>
        )}

        {groups.map(({ floor, tables: floorTables, highlight }) => (
          <section key={floor.id}>
            <h2
              className={cn(
                "mb-3 inline-block text-xs font-semibold uppercase tracking-[0.15em]",
                highlight ? "bg-accent px-2 py-0.5 text-foreground" : "text-muted-foreground",
              )}
            >
              {floor.name}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {floorTables.map((table) => (
                <TableTile key={table.id} table={table} order={orderFor(table)} onOpen={() => navigate(`/order/${table.id}`)} />
              ))}
            </div>
          </section>
        ))}

        {query && groups.length === 0 && (
          <p className="text-sm text-muted-foreground">No tables or floors match “{query}”.</p>
        )}
      </div>
    </div>
  );
}

function TableTile({ table, order, onOpen }: { table: Table; order?: Order; onOpen: () => void }) {
  const occupied = !!order;
  const reserved = !occupied && table.status === "reserved";
  return (
    <button
      onClick={onOpen}
      className={cn(
        "flex aspect-square flex-col items-center justify-center gap-1 border p-3 transition-colors",
        occupied
          ? "border-warning bg-warning/10 hover:bg-warning/20"
          : reserved
            ? "border-info/60 bg-info/15 hover:bg-info/25"
            : "border-success/60 bg-success/20 hover:bg-success/30",
      )}
    >
      <div className="font-heading text-2xl font-bold">{table.name}</div>
      {occupied ? (
        <>
          <div className="text-sm font-semibold nums">{inr(order!.total)}</div>
          <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-warning">{order!.status}</div>
          {table.seated_at && <DwellTimer seatedAt={table.seated_at} className="text-[0.65rem] text-muted-foreground" />}
        </>
      ) : reserved ? (
        <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-info">Reserved</div>
      ) : (
        <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          {table.capacity} seats
        </div>
      )}
    </button>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-border px-5 py-4 last:border-r-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-2xl font-bold nums">{value}</div>
    </div>
  );
}

function SetupGuide({
  menuDone,
  tablesDone,
  staffDone,
  go,
}: {
  menuDone: boolean;
  tablesDone: boolean;
  staffDone: boolean;
  go: (path: string) => void;
}) {
  const steps = [
    { done: menuDone, title: "Add your menu", desc: "Import a CSV or add items by hand.", cta: "Menu", to: "/menu" },
    { done: tablesDone, title: "Add floors & tables", desc: "Set up your seating to take dine-in orders.", cta: "Tables", to: "/tables" },
    { done: staffDone, title: "Add staff (optional)", desc: "Create waiter logins and pair devices.", cta: "Staff", to: "/staff" },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  return (
    <div className="mx-auto max-w-3xl border border-border p-6">
      <h2 className="font-heading text-xl font-bold">Finish setting up your cafe</h2>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">
        {remaining === 0 ? "All set — you're ready to go." : `${remaining} step${remaining > 1 ? "s" : ""} left before you can take orders.`}
      </p>
      <ol className="space-y-2">
        {steps.map((s) => (
          <li key={s.to} className="flex items-center gap-4 border border-border p-3">
            {s.done ? (
              <CheckCircle size={20} weight="fill" className="shrink-0 text-success" />
            ) : (
              <Circle size={20} className="shrink-0 text-muted-foreground/40" />
            )}
            <div className="min-w-0 flex-1">
              <div className={cn("font-medium", s.done ? "text-muted-foreground line-through" : "text-foreground")}>
                {s.title}
              </div>
              {!s.done && <div className="text-xs text-muted-foreground">{s.desc}</div>}
            </div>
            {!s.done && (
              <Button size="sm" onClick={() => go(s.to)}>
                {s.cta}
                <ArrowRight size={15} />
              </Button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
