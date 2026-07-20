import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/lib/types";

// The lifecycle as the floor reads it. `active` is the legacy alias of `pending`
// (see backend/app/services/orders.py), and `ready` means the food is on the
// table and the bill is due — which is what the manager's alerts announce.
const LABEL: Record<OrderStatus, string> = {
  pending: "Ordered",
  active: "Ordered",
  preparing: "In kitchen",
  ready: "Served · to settle",
  completed: "Settled",
  cancelled: "Cancelled",
};

const VARIANT: Record<OrderStatus, "outline" | "warning" | "success" | "danger"> = {
  pending: "outline",
  active: "outline",
  preparing: "warning",
  ready: "success",
  completed: "outline",
  cancelled: "danger",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}

/** Compact form for dense surfaces (the tables grid) — text only, no chrome. */
export function orderStatusLabel(status: OrderStatus): string {
  return LABEL[status];
}
