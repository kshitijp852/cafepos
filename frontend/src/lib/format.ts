export const inr = (n: number | null | undefined): string => `₹${(n ?? 0).toFixed(2)}`;

// A bill's display number: prefixed with its device series when set (e.g.
// "C-42"), or the bare serial for the default/legacy line.
export function formatBillNo(
  bill: { series?: string | null; bill_number: number } | null | undefined,
): string {
  if (!bill) return "";
  return bill.series ? `${bill.series}-${bill.bill_number}` : `${bill.bill_number}`;
}

// Elapsed duration as m:ss (under an hour) or h:mm:ss. For live table dwell timers.
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}
