import { NavLink } from "react-router-dom";
import {
  CalendarBlank,
  ChartLineUp,
  ClockCounterClockwise,
  ForkKnife,
  GearSix,
  GridFour,
  Package,
  ShoppingBag,
  SquaresFour,
  Users,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";

import { useReconciliation } from "@/api/queries";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: Icon; end?: boolean };
type NavGroup = { heading: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Operate",
    items: [
      { to: "/dashboard", label: "Floor", icon: SquaresFour },
      { to: "/order", label: "Take Away", icon: ShoppingBag, end: true },
      { to: "/reservations", label: "Reservations", icon: CalendarBlank },
      { to: "/reconcile", label: "Reconcile", icon: WarningCircle },
    ],
  },
  {
    heading: "Catalog",
    items: [
      { to: "/menu", label: "Menu", icon: ForkKnife },
      { to: "/inventory", label: "Inventory", icon: Package },
    ],
  },
  {
    heading: "Setup",
    items: [
      { to: "/tables", label: "Tables", icon: GridFour },
      { to: "/staff", label: "Staff", icon: Users },
      { to: "/settings", label: "Settings", icon: GearSix },
    ],
  },
  {
    heading: "Insights",
    items: [
      { to: "/analytics", label: "Analytics", icon: ChartLineUp },
      { to: "/history", label: "History", icon: ClockCounterClockwise },
    ],
  },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  // Live count of unresolved offline-replay conflicts, shown as a badge on the
  // Reconcile link so managers notice when a sync left something to review.
  const { data: reconciliation } = useReconciliation();
  const conflictCount = reconciliation?.count ?? 0;

  return (
    <nav className="flex-1 overflow-y-auto py-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.heading} className="mb-5">
          <div className="px-5 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {group.heading}
          </div>
          <ul>
            {group.items.map(({ to, label, icon: Icon, end }) => {
              const badge = to === "/reconcile" ? conflictCount : 0;
              return (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground/70 hover:bg-accent hover:text-foreground",
                      )
                    }
                  >
                    <Icon size={19} />
                    <span>{label}</span>
                    {badge > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">
                        {badge}
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-baseline gap-1.5 font-serif">
      <span className="text-xl font-bold tracking-tight">Café</span>
      <span className="text-xl font-semibold text-muted-foreground">POS</span>
    </div>
  );
}
