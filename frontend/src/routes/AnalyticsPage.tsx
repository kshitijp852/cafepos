import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getAnalytics } from "@/api/endpoints";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr } from "@/lib/format";

export function AnalyticsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({ queryKey: ["analytics"], queryFn: getAnalytics });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (isError || !data) return <div className="p-6 text-sm text-danger">Could not load analytics.</div>;

  const pay = (o: Record<string, number>) => (o.card ?? 0) + (o.upi ?? 0);
  const maxTrend = Math.max(1, ...data.trend_7d.map((d) => d.revenue));

  const today = [
    { label: "Revenue Today", value: inr(data.today.revenue) },
    { label: "Bills Today", value: String(data.today.bills) },
    { label: "Cash Today", value: inr(data.today.payment_breakdown.cash ?? 0) },
    { label: "Card + UPI Today", value: inr(pay(data.today.payment_breakdown)) },
  ];
  const allTime = [
    { label: "Total Revenue", value: inr(data.totals.revenue) },
    { label: "Total Bills", value: String(data.totals.bills) },
    { label: "Avg Bill", value: inr(Math.round(data.totals.avg_bill)) },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Cafe-wide performance across all time.</p>
      </div>

      {/* Today */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Today</h2>
        <div className="grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4">
          {today.map((k) => (
            <Kpi key={k.label} label={k.label} value={k.value} />
          ))}
        </div>
      </section>

      {/* All-time */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">All time</h2>
        <div className="grid grid-cols-3 gap-px border border-border bg-border">
          {allTime.map((k) => (
            <Kpi key={k.label} label={k.label} value={k.value} />
          ))}
        </div>
      </section>

      {/* 7-day trend */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Last 7 days</h2>
        <div className="flex items-end justify-between gap-2 border border-border p-4" style={{ height: 180 }}>
          {data.trend_7d.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
              <div className="text-[0.6rem] text-muted-foreground nums">{d.revenue > 0 ? inr(d.revenue) : ""}</div>
              <div
                className="w-full bg-primary transition-[height]"
                style={{ height: `${Math.max(2, (d.revenue / maxTrend) * 110)}px` }}
                title={`${d.date}: ${inr(d.revenue)}`}
              />
              <div className="text-[0.6rem] text-muted-foreground">{d.date.slice(5)}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Payment split */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Payment split (all time)</h2>
          <div className="border border-border">
            {["cash", "card", "upi"].map((m) => (
              <div key={m} className="flex items-center justify-between border-b border-border px-4 py-2.5 last:border-0">
                <span className="text-sm capitalize">{m}</span>
                <span className="nums text-sm font-semibold">{inr(data.payment_breakdown[m] ?? 0)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Top items */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Top items</h2>
          <div className="border border-border">
            {data.top_items.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              data.top_items.slice(0, 6).map(([name, qty]) => (
                <div key={name} className="flex items-center justify-between border-b border-border px-4 py-2.5 last:border-0">
                  <span className="text-sm">{name}</span>
                  <span className="nums text-sm font-semibold">{qty}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Staff leaderboard */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Staff leaderboard</h2>
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Staff</TableHead>
                <TableHead className="text-right">Bills</TableHead>
                <TableHead className="px-4 text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.by_staff.map((s) => (
                <TableRow key={s.waiter_id} className="cursor-pointer" onClick={() => navigate(`/staff/${s.waiter_id}`)}>
                  <TableCell className="px-4 font-medium">{s.waiter_name}</TableCell>
                  <TableCell className="text-right nums">{s.bills}</TableCell>
                  <TableCell className="px-4 text-right font-semibold nums">{inr(s.revenue)}</TableCell>
                </TableRow>
              ))}
              {data.by_staff.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    No staff-attributed sales yet.
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-serif text-2xl font-bold nums">{value}</div>
    </div>
  );
}
