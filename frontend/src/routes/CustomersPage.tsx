import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getCustomerInsights, type CustomerRow } from "@/api/endpoints";
import { CHART_COLORS, ChartCard, DonutChart, EmptyChart, HBarChart, StackedBarChart } from "@/components/charts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGES = [14, 30, 90] as const;
type Range = (typeof RANGES)[number];

const compactInr = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${Math.round(n)}`;

const dayLabel = (iso: string) => iso.slice(5).replace("-", "/");

// Customer phone numbers are personal data. The manager owns this list, but the
// middle digits stay hidden so a shoulder-surfed screen doesn't leak it.
const maskPhone = (phone: string) =>
  phone.length <= 6 ? phone : `${phone.slice(0, phone.length - 8)}••••${phone.slice(-4)}`;

const lastSeen = (days: number | null) =>
  days === null ? "—" : days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;

export function CustomersPage() {
  const [range, setRange] = useState<Range>(30);
  const [showPhones, setShowPhones] = useState(false);
  const { data, isLoading, isError } = useQuery({ queryKey: ["customer-insights"], queryFn: getCustomerInsights });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (isError || !data) return <div className="p-6 text-sm text-danger">Could not load customer insights.</div>;

  const t = data.totals;
  const trend = data.new_vs_returning.slice(-range);
  const newInRange = trend.reduce((s, d) => s + d.new, 0);
  const returningInRange = trend.reduce((s, d) => s + d.returning, 0);

  const kpis = [
    { label: "Known Customers", value: String(t.customers), note: `from ${t.identified_bills} identified bills` },
    { label: "Capture Rate", value: `${t.capture_rate}%`, note: `of ${t.bills} bills carry a phone` },
    { label: "Repeat Rate", value: `${t.repeat_rate}%`, note: `${t.repeat_customers} came back` },
    { label: "Avg Spend / Customer", value: inr(t.avg_spend), note: `${t.avg_visits} visits each` },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Customers</h1>
        <p className="text-sm text-muted-foreground">
          Built from the name and phone number your staff capture when settling a bill. Nothing here is bought or
          inferred — it is only what customers gave you at the counter.
        </p>
      </div>

      <section>
        <div className="grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="bg-card p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.label}</div>
              <div className="mt-1 font-heading text-2xl font-bold nums">{k.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{k.note}</div>
            </div>
          ))}
        </div>
      </section>

      {/* New vs returning */}
      <ChartCard
        title="New vs returning"
        stat={`${returningInRange}`}
        statNote={`returning visits vs ${newInRange} first-timers, last ${range} days`}
        description="Each day's identified bills split by whether that phone number had ever bought from you before. A healthy cafe keeps a steady band of returning customers with new ones layered on top — if the returning band thins out, you are refilling a leaking bucket."
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
        <StackedBarChart
          data={trend.map((d) => ({ label: dayLabel(d.date), values: [d.returning, d.new] }))}
          series={[
            { label: "Returning", color: CHART_COLORS[0] },
            { label: "New", color: CHART_COLORS[1] },
          ]}
          showLabels={range <= 30}
        />
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Visit frequency */}
        <ChartCard
          title="Visit frequency"
          stat={String(t.repeat_customers)}
          statNote={`of ${t.customers} customers visited more than once`}
          description="How many times each known customer has bought from you. The single-visit bar is your biggest growth lever: moving even a slice of it to a second visit is cheaper than finding new people."
        >
          <HBarChart
            data={data.visit_buckets.map((b) => ({ label: b.label, value: b.count }))}
            color={CHART_COLORS[4]}
          />
        </ChartCard>

        {/* Revenue concentration */}
        <ChartCard
          title="Where revenue comes from"
          stat={`${t.repeat_revenue_share}%`}
          statNote="of identified revenue is from repeat customers"
          description="Identified revenue split between customers who came back and those who visited once. A high repeat share means the business rests on a regular crowd — good for stability, risky if those regulars drift away."
        >
          <DonutChart
            data={[
              { label: "Repeat customers", value: t.repeat_revenue, color: CHART_COLORS[0] },
              {
                label: "One-time customers",
                value: Math.max(0, t.identified_revenue - t.repeat_revenue),
                color: CHART_COLORS[1],
              },
              { label: "No phone captured", value: t.unidentified_revenue, color: CHART_COLORS[3] },
            ]}
            centerValue={`${t.capture_rate}%`}
            centerLabel="Captured"
            formatValue={compactInr}
          />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active vs lapsed */}
        <ChartCard
          title="Active vs lapsed"
          stat={String(t.active_customers)}
          statNote={`seen within ${t.lapsed_after_days} days`}
          description={`Customers are counted active if they bought within the last ${t.lapsed_after_days} days. The lapsed group is a list you can act on — a message or an offer costs nothing compared with acquiring someone new.`}
        >
          <DonutChart
            data={[
              { label: "Active", value: t.active_customers, color: CHART_COLORS[0] },
              { label: "Lapsed", value: t.lapsed_customers, color: CHART_COLORS[2] },
            ]}
            centerValue={String(t.customers)}
            centerLabel="Customers"
          />
        </ChartCard>

        {/* Top customers by revenue */}
        <ChartCard
          title="Best customers"
          stat={data.top_customers[0] ? compactInr(data.top_customers[0].revenue) : "—"}
          statNote={data.top_customers[0] ? `from ${data.top_customers[0].name}, your top spender` : "no data yet"}
          description="Your highest-spending customers all time. These are the people worth recognising by name at the counter — the top handful usually carry a disproportionate share of the month."
        >
          <HBarChart
            data={data.top_customers.slice(0, 8).map((c) => ({
              label: c.name,
              value: c.revenue,
              sublabel: `${c.visits} visits`,
            }))}
            formatValue={compactInr}
          />
        </ChartCard>
      </div>

      <CustomerTable
        title="Top customers"
        caption="Ranked by total spend. Contact details come from your own settlements."
        rows={data.top_customers}
        showPhones={showPhones}
        onTogglePhones={() => setShowPhones((v) => !v)}
        empty="No customer details captured yet."
      />

      <CustomerTable
        title="Lapsed regulars"
        caption={`Customers with more than one visit who haven't been back in over ${t.lapsed_after_days} days — the win-back list.`}
        rows={data.recent_lapsed}
        showPhones={showPhones}
        onTogglePhones={() => setShowPhones((v) => !v)}
        empty="No lapsed regulars — everyone with repeat visits has been back recently."
      />
    </div>
  );
}

function CustomerTable({
  title,
  caption,
  rows,
  showPhones,
  onTogglePhones,
  empty,
}: {
  title: string;
  caption: string;
  rows: CustomerRow[];
  showPhones: boolean;
  onTogglePhones: () => void;
  empty: string;
}) {
  return (
    <section className="border border-border bg-card">
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">{caption}</p>
        </div>
        <button
          type="button"
          onClick={onTogglePhones}
          className="shrink-0 border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {showPhones ? "Hide numbers" : "Show numbers"}
        </button>
      </header>
      {rows.length === 0 ? (
        <EmptyChart label={empty} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-5">Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Visits</TableHead>
              <TableHead className="text-right">Avg bill</TableHead>
              <TableHead className="text-right">Last seen</TableHead>
              <TableHead className="px-5 text-right">Total spend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.phone}>
                <TableCell className="px-5 font-medium">{c.name}</TableCell>
                <TableCell className="nums text-muted-foreground">
                  {showPhones ? c.phone : maskPhone(c.phone)}
                </TableCell>
                <TableCell className="text-right nums">{c.visits}</TableCell>
                <TableCell className="text-right nums">{inr(c.avg_bill)}</TableCell>
                <TableCell className="text-right nums text-muted-foreground">{lastSeen(c.days_since)}</TableCell>
                <TableCell className="px-5 text-right font-semibold nums">{inr(c.revenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
