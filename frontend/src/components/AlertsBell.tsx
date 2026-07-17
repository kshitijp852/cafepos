import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ForkKnife, Package, Storefront, WarningCircle } from "@phosphor-icons/react";

import { useActiveOrders, useCurrentSession, useInventory, useReservations, useTables } from "@/api/queries";
import { cn } from "@/lib/utils";

type Level = "danger" | "warning" | "info";
type Alert = { id: string; level: Level; icon: typeof Bell; title: string; detail?: string; to: string };

const LONG_TABLE_MINUTES = 45; // a dine-in order open longer than this needs attention
const RES_SOON_MINUTES = 90; // reservations arriving within this window

const LEVEL_DOT: Record<Level, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-foreground",
};

/** Operational alerts derived from live data — things a manager should act on now,
 *  not a generic notification feed. Each item links to where it can be handled. */
export function AlertsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: inventory = [] } = useInventory();
  const { data: session } = useCurrentSession();
  const { data: reservations = [] } = useReservations();
  const { data: tables = [] } = useTables();
  const { orders } = useActiveOrders();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];
    const now = Date.now();
    const tableName = (id?: string | null) => (id ? tables.find((t) => t.id === id)?.name ?? "Table" : "Counter");

    if (!session) {
      out.push({ id: "no-session", level: "warning", icon: Storefront, title: "Day session not opened", detail: "Open it to track cash", to: "/history" });
    }

    for (const it of inventory) {
      if (it.current_stock <= it.min_stock) {
        out.push({
          id: `stock-${it.id}`,
          level: "danger",
          icon: Package,
          title: `${it.name} low`,
          detail: `${it.current_stock} ${it.unit} left`,
          to: "/inventory",
        });
      }
    }

    for (const o of orders) {
      const mins = Math.floor((now - +new Date(o.created_at)) / 60000);
      if (o.status === "ready") {
        out.push({ id: `ready-${o.id}`, level: "info", icon: ForkKnife, title: `${tableName(o.table_id)} ready to settle`, to: "/dashboard" });
      } else if (mins >= LONG_TABLE_MINUTES && o.table_id) {
        out.push({
          id: `long-${o.id}`,
          level: "danger",
          icon: WarningCircle,
          title: `${tableName(o.table_id)} open ${mins}m`,
          detail: "Long-running order",
          to: "/dashboard",
        });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    for (const r of reservations) {
      if (r.status !== "confirmed" || r.reservation_date !== today) continue;
      const at = +new Date(`${r.reservation_date}T${r.reservation_time}`);
      const diff = (at - now) / 60000;
      if (diff >= -10 && diff <= RES_SOON_MINUTES) {
        out.push({
          id: `res-${r.id}`,
          level: "warning",
          icon: Bell,
          title: `${r.customer_name} · ${r.reservation_time}`,
          detail: `${tableName(r.table_id)} · ${r.guest_count} guests`,
          to: "/reservations",
        });
      }
    }

    const rank: Record<Level, number> = { danger: 0, warning: 1, info: 2 };
    return out.sort((a, b) => rank[a.level] - rank[b.level]);
  }, [inventory, session, reservations, tables, orders]);

  const count = alerts.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center border border-transparent transition-colors hover:bg-accent"
        aria-label={`Alerts${count ? ` (${count})` : ""}`}
        aria-expanded={open}
      >
        <Bell size={20} weight={count ? "fill" : "regular"} />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center bg-danger px-1 text-[0.6rem] font-bold text-danger-foreground nums">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-80 border border-border bg-card shadow-2xl shadow-foreground/10">
          <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Needs attention{count ? ` · ${count}` : ""}
          </div>
          <div className="max-h-[70vh] overflow-auto">
            {count === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">All clear. Nothing needs attention.</div>
            ) : (
              alerts.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      setOpen(false);
                      navigate(a.to);
                    }}
                    className="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-accent"
                  >
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0", LEVEL_DOT[a.level])} />
                    <Icon size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{a.title}</span>
                      {a.detail && <span className="block text-xs text-muted-foreground">{a.detail}</span>}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
