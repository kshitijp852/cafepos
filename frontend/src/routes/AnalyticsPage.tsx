import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getAnalytics, type OrderTypeKey } from "@/api/endpoints";
import {
  AreaChart,
  BarChart,
  CHART_COLORS,
  ChartCard,
  DonutChart,
  EmptyChart,
  HBarChart,
} from "@/components/charts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuration, inr } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

const ORDER_TYPE_LABELS: Record<OrderTypeKey, string> = {
  dine_in: "Dine-in",
  takeaway: "Take-away",
  delivery: "Delivery",
};

// Compact money for axis/summary text, where two decimals are just noise.
const compactInr = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${Math.round(n)}`;

const dayLabel = (iso: string) => iso.slice(5).replace("-", "/");
const hourLabel = (h: number) => (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? "a" : "p");

export function AnalyticsPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>(30);
  const { data, isLoading, isError } = useQuery({ queryKey: ["analytics"], queryFn: getAnalytics });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (isError || !data) return <div className="p-6 text-sm text-danger">Could not load analytics.</div>;

  const pay = (o: Record<string, number> = {}) => (o.card ?? 0) + (o.upi ?? 0);
  // A cached response from an older API version can be missing whole sections;
  // render those as empty charts rather than taking the page down.
  const trendDaily = data.trend_daily ?? [];
  const byHour = data.by_hour ?? [];
  const byWeekday = data.by_weekday ?? [];
  const byStaff = data.by_staff ?? [];
  const topItems = data.top_items ?? [];
  const topItemsRevenue = data.top_items_revenue ?? [];
  const dwell = data.dwell ?? { sampled_bills: 0, avg_seconds: 0, buckets: [] };

  const series = trendDaily.slice(-range);
  const rangeRevenue = series.reduce((s, d) => s + d.revenue, 0);
  const rangeBills = series.reduce((s, d) => s + d.bills, 0);
  const activeDays = series.filter((d) => d.bills > 0).length;

  const today = [
    { label: "Revenue Today", value: inr(data.today.revenue) },
    { label: "Bills Today", value: String(data.today.bills) },
    { label: "Cash Today", value: inr(data.today.payment_breakdown?.cash ?? 0) },
    { label: "Card + UPI Today", value: inr(pay(data.today.payment_breakdown)) },
  ];
  const allTime = [
    { label: "Total Revenue", value: inr(data.totals.revenue) },
    { label: "Total Bills", value: String(data.totals.bills) },
    { label: "Avg Bill", value: inr(Math.round(data.totals.avg_bill)) },
  ];

  const busiestHour = [...byHour].sort((a, b) => b.revenue - a.revenue)[0];
  const busiestDay = [...byWeekday].sort((a, b) => b.revenue - a.revenue)[0];
  const orderTypeEntries = (Object.keys(ORDER_TYPE_LABELS) as OrderTypeKey[]).map((k, i) => ({
    label: ORDER_TYPE_LABELS[k],
    value: data.order_types?.[k]?.revenue ?? 0,
    color: CHART_COLORS[i],
  }));
  const share = (part: number) => (data.totals.revenue > 0 ? (part / data.totals.revenue) * 100 : 0);
  const cashShare = share(data.payment_breakdown?.cash ?? 0);
  const dineInShare = share(data.order_types?.dine_in?.revenue ?? 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Analytics</h1>
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

      {/* Revenue trend */}
      <ChartCard
        title="Revenue trend"
        stat={compactInr(rangeRevenue)}
        statNote={`across ${rangeBills} bills · ${activeDays} trading days`}
        description="Total settled revenue for each day in the selected range. Use it to spot growth, slow weeks, and the effect of anything you changed — a new menu, longer hours, a promotion. Gaps at zero are days with no bills."
        action={
          <div className="flex border border-border">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium transition-colors",
                  range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {r}d
              </button>
            ))}
          </div>
        }
      >
        <AreaChart
          data={series.map((d) => ({ label: dayLabel(d.date), value: d.revenue }))}
          formatValue={compactInr}
        />
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bills per day */}
        <ChartCard
          title="Bills per day"
          stat={String(rangeBills)}
          statNote={`bills over the last ${range} days`}
          description="How many bills were settled each day — footfall rather than money. Read it against the revenue trend: same bills but lower revenue means smaller orders, not fewer customers."
        >
          <BarChart
            data={series.map((d) => ({
              label: dayLabel(d.date),
              value: d.bills,
              tooltip: `${d.date}: ${d.bills} bills`,
            }))}
            // Dense ranges can't fit a label under every bar.
            showLabels={range <= 14}
            color={CHART_COLORS[4]}
          />
        </ChartCard>

        {/* Average bill */}
        <ChartCard
          title="Average bill"
          stat={rangeBills > 0 ? inr(rangeRevenue / rangeBills) : "—"}
          statNote={rangeBills > 0 ? "per bill over the range" : "no bills in range"}
          description="Revenue divided by bill count for each day — what a typical customer spends. A rising line means upselling or pricing is working; a fall usually means more small takeaway orders."
        >
          <AreaChart
            data={series.map((d) => ({ label: dayLabel(d.date), value: d.avg_bill }))}
            color={CHART_COLORS[1]}
            formatValue={compactInr}
            ariaLabel="Average bill trend"
          />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top items by revenue */}
        <ChartCard
          title="Top items by revenue"
          stat={topItemsRevenue[0] ? compactInr(topItemsRevenue[0].revenue) : "—"}
          statNote={topItemsRevenue[0] ? `from ${topItemsRevenue[0].name}, the top earner` : "no sales yet"}
          description="Which dishes actually bring in the money, all time. These are the items worth protecting: keep them in stock, price them carefully, and put them where customers see them first."
        >
          <HBarChart
            data={topItemsRevenue.slice(0, 8).map((it) => ({
              label: it.name,
              value: it.revenue,
              sublabel: `×${it.qty}`,
            }))}
            formatValue={compactInr}
          />
        </ChartCard>

        {/* Top items by quantity */}
        <ChartCard
          title="Top items by quantity"
          stat={topItems[0] ? `${topItems[0][1]}` : "—"}
          statNote={topItems[0] ? `units of ${topItems[0][0]}, the best seller` : "no sales yet"}
          description="The same menu ranked by units sold instead of rupees. An item high here but low on revenue is a cheap crowd-puller — good for footfall, thin on margin, and a candidate for a combo."
        >
          <HBarChart
            data={topItems.slice(0, 8).map(([name, qty]) => ({ label: name, value: qty }))}
            color={CHART_COLORS[1]}
          />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Payment split */}
        <ChartCard
          title="Payment split"
          stat={data.totals.revenue > 0 ? `${cashShare.toFixed(0)}%` : "—"}
          statNote={data.totals.revenue > 0 ? "of revenue collected in cash" : "cash vs card vs UPI"}
          description="How customers pay, by rupees collected. Drives how much float the drawer needs and how much of the day's takings must be reconciled by hand at close."
        >
          <DonutChart
            data={["cash", "card", "upi"].map((m, i) => ({
              label: m.toUpperCase(),
              value: (data.payment_breakdown ?? {})[m] ?? 0,
              color: CHART_COLORS[i],
            }))}
            centerValue={compactInr(data.totals.revenue)}
            centerLabel="Total"
            formatValue={compactInr}
          />
        </ChartCard>

        {/* Order type split */}
        <ChartCard
          title="Order type"
          stat={data.totals.bills > 0 ? `${dineInShare.toFixed(0)}%` : "—"}
          statNote={data.totals.bills > 0 ? "of revenue is dine-in" : "dine-in vs take-away vs delivery"}
          description="Revenue split by how the order left the counter, inferred from the packing or delivery charge on each bill. Tells you how much of the business depends on seats versus packaging and riders."
        >
          <DonutChart
            data={orderTypeEntries}
            centerValue={String(data.totals.bills)}
            centerLabel="Bills"
            formatValue={compactInr}
          />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Peak hours */}
        <ChartCard
          title="Peak hours"
          stat={busiestHour && busiestHour.revenue > 0 ? hourLabel(busiestHour.hour) : "—"}
          statNote={
            busiestHour && busiestHour.revenue > 0
              ? `is the busiest hour · ${compactInr(busiestHour.revenue)}`
              : "by local hour, all time"
          }
          description="Revenue by hour of the day, across all time and in your local time. This is the staffing chart: roster people into the tall bars, and treat the flat hours as candidates for prep, cleaning, or shorter opening times."
        >
          <BarChart
            data={byHour.map((h) => ({
              label: h.hour % 3 === 0 ? hourLabel(h.hour) : "",
              value: h.revenue,
              tooltip: `${hourLabel(h.hour)}: ${inr(h.revenue)} · ${h.bills} bills`,
            }))}
            formatValue={compactInr}
          />
        </ChartCard>

        {/* Weekday pattern */}
        <ChartCard
          title="Day of week"
          stat={busiestDay && busiestDay.revenue > 0 ? busiestDay.label : "—"}
          statNote={
            busiestDay && busiestDay.revenue > 0
              ? `is the strongest day · ${compactInr(busiestDay.revenue)}`
              : "by weekday, all time"
          }
          description="All-time revenue collapsed onto the seven weekdays. Use it to plan stock deliveries and staff leave around the weak days, and to decide when a promotion is worth running."
        >
          <BarChart
            data={byWeekday.map((w) => ({
              label: w.label,
              value: w.revenue,
              tooltip: `${w.label}: ${inr(w.revenue)} · ${w.bills} bills`,
            }))}
            color={CHART_COLORS[2]}
            formatValue={compactInr}
          />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Staff revenue */}
        <ChartCard
          title="Staff revenue"
          stat={byStaff[0] ? compactInr(byStaff[0].revenue) : "—"}
          statNote={byStaff[0] ? `from ${byStaff[0].waiter_name}, the leader` : "no attributed bills yet"}
          description="Revenue credited to each staff member, counting only bills settled against a waiter — counter bills are excluded. Read the average alongside the total: a smaller server with a high average is upselling well."
        >
          <HBarChart
            data={byStaff.slice(0, 8).map((s) => ({
              label: s.waiter_name,
              value: s.revenue,
              sublabel: `${s.bills} bills · avg ${compactInr(s.avg_bill)}`,
            }))}
            formatValue={compactInr}
          />
        </ChartCard>

        {/* Table dwell time */}
        <ChartCard
          title="Table dwell time"
          stat={dwell.sampled_bills > 0 ? formatDuration(dwell.avg_seconds) : "—"}
          statNote={
            dwell.sampled_bills > 0
              ? `average across ${dwell.sampled_bills} bills`
              : "recorded on dine-in settlements"
          }
          description="How long tables stay occupied, from the first order to settlement, grouped into time bands. Long dwell on a full floor is lost turnover; very short dwell usually means the order was takeaway-like."
        >
          {dwell.sampled_bills === 0 ? (
            <EmptyChart label="No dwell times recorded yet." />
          ) : (
            <BarChart
              data={dwell.buckets.map((b) => ({
                label: b.label,
                value: b.count,
                tooltip: `${b.label}: ${b.count} bills`,
              }))}
              color={CHART_COLORS[3]}
            />
          )}
        </ChartCard>
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
                <TableHead className="text-right">Avg bill</TableHead>
                <TableHead className="px-4 text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byStaff.map((s) => (
                <TableRow key={s.waiter_id} className="cursor-pointer" onClick={() => navigate(`/staff/${s.waiter_id}`)}>
                  <TableCell className="px-4 font-medium">{s.waiter_name}</TableCell>
                  <TableCell className="text-right nums">{s.bills}</TableCell>
                  <TableCell className="text-right nums">{inr(s.avg_bill)}</TableCell>
                  <TableCell className="px-4 text-right font-semibold nums">{inr(s.revenue)}</TableCell>
                </TableRow>
              ))}
              {byStaff.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
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
      <div className="mt-1 font-heading text-2xl font-bold nums">{value}</div>
    </div>
  );
}
