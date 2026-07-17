import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "@phosphor-icons/react";

import { getWaiterStats } from "@/api/endpoints";
import { useTables } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr, timeAgo } from "@/lib/format";

export function StaffDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: tables = [] } = useTables();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["waiterStats", id],
    queryFn: () => getWaiterStats(id),
    enabled: !!id,
  });

  const tableName = (tid: string | null) => (tid ? tables.find((t) => t.id === tid)?.name ?? "—" : "Counter");

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (isError || !data) return <div className="p-6 text-sm text-danger">Could not load staff analytics.</div>;

  const kpis = [
    { label: "Revenue", value: inr(data.revenue) },
    { label: "Bills", value: String(data.bills_count) },
    { label: "Avg Bill", value: inr(Math.round(data.avg_bill)) },
    { label: "Orders Taken", value: String(data.orders_taken) },
    { label: "Tables Served", value: String(data.tables_served) },
    { label: "Items Sold", value: String(data.items_sold) },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/staff")} aria-label="Back to staff">
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="font-serif text-2xl font-bold">{data.staff.name}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">@{data.staff.username}</span>
            {data.last_active ? ` · last active ${timeAgo(data.last_active)}` : ""}
          </p>
        </div>
        <Badge variant={data.staff.is_active === false ? "outline" : "success"} className="ml-auto">
          {data.staff.is_active === false ? "Inactive" : "Active"}
        </Badge>
      </div>

      {/* KPIs */}
      <h2 className="-mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">All-time totals</h2>
      <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className="mt-1 font-serif text-2xl font-bold nums">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Top items */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Top items</h2>
          <div className="border border-border">
            {data.top_items.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              data.top_items.map(([name, qty]) => (
                <div key={name} className="flex items-center justify-between border-b border-border px-4 py-2.5 last:border-0">
                  <span className="text-sm">{name}</span>
                  <span className="nums text-sm font-semibold">{qty}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Payment split */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Payment split</h2>
          <div className="border border-border">
            {["cash", "card", "upi"].map((m) => (
              <div key={m} className="flex items-center justify-between border-b border-border px-4 py-2.5 last:border-0">
                <span className="text-sm capitalize">{m}</span>
                <span className="nums text-sm font-semibold">{inr(data.payment_breakdown[m] ?? 0)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Recent bills */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recent bills</h2>
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Bill</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="px-4 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent_bills.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="px-4 font-medium nums">#{b.bill_number}</TableCell>
                  <TableCell>{tableName(b.table_id)}</TableCell>
                  <TableCell className="nums text-muted-foreground">{b.item_count}</TableCell>
                  <TableCell className="capitalize">{b.payment_method}</TableCell>
                  <TableCell className="text-muted-foreground">{timeAgo(b.created_at)}</TableCell>
                  <TableCell className="px-4 text-right font-semibold nums">{inr(b.total)}</TableCell>
                </TableRow>
              ))}
              {data.recent_bills.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No bills attributed to this staff yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
