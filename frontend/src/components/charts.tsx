import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Dependency-free chart primitives. Everything is plain SVG/CSS in the app's
 * flat, square-cornered style — no chart library, so the PWA bundle stays small
 * and the palette comes from the --chart-* theme tokens.
 */

export const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

/** Measures the rendered width so charts can use real pixel geometry instead of
 *  a stretched viewBox — otherwise curves and bars skew on wide screens. */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

export function ChartCard({
  title,
  stat,
  statNote,
  description,
  action,
  children,
  className,
}: {
  title: string;
  /** The headline number for this chart — set large so it reads before the chart. */
  stat?: string;
  /** Short context that sits next to the headline number. */
  statNote?: string;
  /** Plain-language explanation of what the chart plots and how to read it. */
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col border border-border bg-card", className)}>
      <header className="border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
            {stat && (
              <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                <span className="nums font-heading text-2xl font-bold leading-none">{stat}</span>
                {statNote && <span className="text-sm text-muted-foreground">{statNote}</span>}
              </p>
            )}
          </div>
          {action}
        </div>
        {description && <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </header>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}

export function EmptyChart({ label = "No data yet." }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{label}</p>;
}

/**
 * Vertical bars. Values are printed above each bar when there is room for them
 * (dense ranges would collide), and the tallest bar is always called out.
 */
export function BarChart({
  data,
  height = 200,
  color = CHART_COLORS[0],
  showLabels = true,
  formatValue = (n) => String(n),
  /** Above this many bars, per-bar value text is dropped as unreadable. */
  valueLabelLimit = 14,
}: {
  data: { label: string; value: number; tooltip?: string }[];
  height?: number;
  color?: string;
  showLabels?: boolean;
  formatValue?: (n: number) => string;
  valueLabelLimit?: number;
}) {
  if (data.length === 0) return <EmptyChart />;
  const max = Math.max(1, ...data.map((d) => d.value));
  const peakIndex = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const showValues = data.length <= valueLabelLimit;
  const labelRow = showLabels ? 20 : 0;
  const valueRow = 18;
  const plot = height - labelRow - valueRow;

  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => {
        const isPeak = i === peakIndex && d.value > 0;
        return (
          <div key={`${d.label}-${i}`} className="flex h-full flex-1 flex-col justify-end gap-1.5">
            <div
              className={cn(
                "nums truncate text-center text-xs leading-none",
                isPeak ? "font-bold text-foreground" : "text-muted-foreground",
              )}
              style={{ height: valueRow }}
            >
              {/* Always surface the peak, even in ranges too dense to label fully. */}
              {d.value > 0 && (showValues || isPeak) ? formatValue(d.value) : ""}
            </div>
            <div
              className="w-full transition-[height] duration-300"
              style={{
                height: `${Math.max(d.value > 0 ? 3 : 1, (d.value / max) * plot)}px`,
                backgroundColor: d.value > 0 ? color : "hsl(var(--border))",
                opacity: d.value > 0 && !isPeak ? 0.85 : 1,
              }}
              title={d.tooltip ?? `${d.label}: ${formatValue(d.value)}`}
            />
            {showLabels && (
              <div
                className={cn(
                  "truncate text-center text-xs leading-none",
                  isPeak ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {d.label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Stacked vertical bars — one bar per period, split into labelled segments. */
export function StackedBarChart({
  data,
  series,
  height = 200,
  showLabels = true,
  formatValue = (n) => String(n),
}: {
  data: { label: string; values: number[] }[];
  series: { label: string; color: string }[];
  height?: number;
  showLabels?: boolean;
  formatValue?: (n: number) => string;
}) {
  if (data.length === 0) return <EmptyChart />;
  const totals = data.map((d) => d.values.reduce((s, v) => s + v, 0));
  const max = Math.max(1, ...totals);
  const labelRow = showLabels ? 20 : 0;
  const plot = height - labelRow;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((d, i) => (
          <div key={`${d.label}-${i}`} className="flex h-full flex-1 flex-col justify-end gap-1.5">
            <div
              className="flex w-full flex-col-reverse"
              style={{ height: `${Math.max(totals[i] > 0 ? 3 : 1, (totals[i] / max) * plot)}px` }}
              title={`${d.label}: ${series
                .map((s, si) => `${s.label} ${formatValue(d.values[si] ?? 0)}`)
                .join(" · ")}`}
            >
              {series.map((s, si) => {
                const value = d.values[si] ?? 0;
                if (totals[i] <= 0) return null;
                return (
                  <div
                    key={s.label}
                    style={{ height: `${(value / totals[i]) * 100}%`, backgroundColor: s.color }}
                  />
                );
              })}
              {totals[i] <= 0 && <div className="h-full" style={{ backgroundColor: "hsl(var(--border))" }} />}
            </div>
            {showLabels && (
              <div className="truncate text-center text-xs leading-none text-muted-foreground">{d.label}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Area + line chart drawn at the container's real pixel size, so the curve and
 * stroke keep their proportions on any screen width. Labels live in HTML below
 * the SVG rather than inside it.
 */
export function AreaChart({
  data,
  height = 200,
  color = CHART_COLORS[0],
  formatValue = (n) => String(n),
  ariaLabel = "Trend",
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  formatValue?: (n: number) => string;
  ariaLabel?: string;
}) {
  const gradientId = useId();
  const [ref, width] = useElementWidth<HTMLDivElement>();

  if (data.length === 0) return <EmptyChart />;

  const max = Math.max(1, ...data.map((d) => d.value));
  const w = width || 600; // first paint, before the observer reports a width
  const h = height;
  const pad = 2; // keep the stroke off the top edge
  // A single point has no span to interpolate across — pin it mid-chart.
  const x = (i: number) => (data.length === 1 ? w / 2 : (i / (data.length - 1)) * w);
  const y = (v: number) => h - (v / max) * (h - pad);
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`;

  // Only ever show a handful of x labels, however long the range is.
  const step = Math.max(1, Math.ceil(data.length / 6));
  const ticks = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-xs text-muted-foreground">
        <span>
          Peak <span className="nums text-sm font-bold text-foreground">{formatValue(max)}</span>
        </span>
        <span>
          Latest{" "}
          <span className="nums text-sm font-bold text-foreground">{formatValue(data[data.length - 1].value)}</span>
        </span>
      </div>
      <div ref={ref} className="relative w-full" style={{ height }}>
        <div className="absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-t border-border/60" />
          ))}
        </div>
        <svg width={w} height={h} className="relative block" role="img" aria-label={ariaLabel}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <circle key={`${d.label}-${i}`} cx={x(i)} cy={y(d.value)} r={data.length > 30 ? 0 : 2.5} fill={color}>
              <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        {ticks.map((d, i) => (
          <span key={`${d.label}-${i}`}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

/** Donut with a centre total and a legend. Slices with 0 value are skipped. */
export function DonutChart({
  data,
  centerLabel,
  centerValue,
  formatValue = (n) => String(n),
  size = 190,
}: {
  data: { label: string; value: number; color?: string }[];
  centerLabel?: string;
  centerValue?: string;
  formatValue?: (n: number) => string;
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return <EmptyChart />;

  const radius = 15.915; // circumference ≈ 100, so dasharray values are percentages
  let offset = 25; // rotate so the first slice starts at 12 o'clock

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 40 40" className="h-full w-full" role="img" aria-label="Distribution">
          {data
            .filter((d) => d.value > 0)
            .map((d, i) => {
              const pct = (d.value / total) * 100;
              const dash = `${pct} ${100 - pct}`;
              const strokeOffset = offset;
              offset -= pct;
              return (
                <circle
                  key={d.label}
                  cx="20"
                  cy="20"
                  r={radius}
                  fill="none"
                  stroke={d.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth="7"
                  strokeDasharray={dash}
                  strokeDashoffset={strokeOffset}
                >
                  <title>{`${d.label}: ${formatValue(d.value)}`}</title>
                </circle>
              );
            })}
        </svg>
        {(centerValue || centerLabel) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {centerValue && <div className="nums font-heading text-xl font-bold leading-none">{centerValue}</div>}
            {centerLabel && (
              <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{centerLabel}</div>
            )}
          </div>
        )}
      </div>
      <ul className="min-w-[9rem] flex-1 space-y-2">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0"
              style={{ backgroundColor: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="flex-1 truncate">{d.label}</span>
            <span className="nums text-base font-bold">{formatValue(d.value)}</span>
            <span className="nums w-11 text-right text-sm font-medium text-muted-foreground">
              {((d.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal ranked bars — for top items, staff, and other label-heavy series. */
export function HBarChart({
  data,
  color = CHART_COLORS[0],
  formatValue = (n) => String(n),
}: {
  data: { label: string; value: number; sublabel?: string }[];
  color?: string;
  formatValue?: (n: number) => string;
}) {
  if (data.length === 0) return <EmptyChart />;
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">
              {d.label}
              {d.sublabel && <span className="ml-2 text-xs text-muted-foreground">{d.sublabel}</span>}
            </span>
            <span className="nums shrink-0 text-base font-bold">{formatValue(d.value)}</span>
          </div>
          <div className="h-1.5 w-full bg-muted">
            <div
              className="h-full transition-[width] duration-300"
              style={{ width: `${Math.max(1, (d.value / max) * 100)}%`, backgroundColor: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
