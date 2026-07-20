import type { Bill, Cafe, Order } from "@/lib/types";
import { formatBillNo } from "@/lib/format";

// Build an ESC/POS receipt as raw bytes, ready to stream to a thermal printer
// over Web Bluetooth or WebUSB. Kept transport-agnostic: this only produces the
// byte stream; printer.ts owns the connection. Works fully offline.

const WIDTH = 32; // characters per line (58mm printers). 80mm printers use 48.

const ESC = 0x1b;
const GS = 0x1d;

class Encoder {
  private parts: number[] = [];
  private enc = new TextEncoder();

  raw(...bytes: number[]): this {
    this.parts.push(...bytes);
    return this;
  }

  // ESC/POS default codepages are ASCII/CP437; strip non-encodable niceties so
  // "₹" doesn't print as garbage.
  text(s: string): this {
    const ascii = s.replace(/₹/g, "Rs").replace(/[^\x20-\x7e]/g, "");
    this.parts.push(...this.enc.encode(ascii));
    return this;
  }

  line(s = ""): this {
    return this.text(s).raw(0x0a);
  }

  init(): this {
    return this.raw(ESC, 0x40); // ESC @  — reset
  }

  align(a: "left" | "center" | "right"): this {
    return this.raw(ESC, 0x61, a === "center" ? 1 : a === "right" ? 2 : 0);
  }

  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  size(double: boolean): this {
    return this.raw(GS, 0x21, double ? 0x11 : 0x00); // double width+height / normal
  }

  feedAndCut(): this {
    return this.raw(0x0a, 0x0a, 0x0a).raw(GS, 0x56, 0x00); // feed 3 + full cut
  }

  bytes(): Uint8Array {
    return new Uint8Array(this.parts);
  }
}

function money(n: number | null | undefined): string {
  return (n ?? 0).toFixed(2);
}

// "Left ............ Right" padded to WIDTH; truncates the left label if needed.
function row(left: string, right: string): string {
  const r = right.slice(0, WIDTH);
  const maxLeft = Math.max(0, WIDTH - r.length - 1);
  const l = left.length > maxLeft ? left.slice(0, maxLeft) : left;
  const gap = WIDTH - l.length - r.length;
  return l + " ".repeat(Math.max(1, gap)) + r;
}

const DIVIDER = "-".repeat(WIDTH);

/**
 * Build a kitchen order ticket. Deliberately price-free and large-type: the
 * kitchen needs quantity, item, and special instructions, nothing else.
 */
export function buildKOT(
  order: Pick<Order, "items" | "created_at" | "waiter_name">,
  opts: { tableName?: string | null; token?: string } = {},
): Uint8Array {
  const e = new Encoder().init();

  e.align("center").bold(true).size(true).line("KOT").size(false);
  e.line(opts.tableName ? `TABLE ${opts.tableName}` : "TAKE AWAY").bold(false);

  e.align("left").line(DIVIDER);
  e.line(new Date(order.created_at).toLocaleTimeString());
  if (order.waiter_name) e.line(`Waiter: ${order.waiter_name}`);
  if (opts.token) e.line(`Ref: ${opts.token}`);
  e.line(DIVIDER);

  for (const it of order.items) {
    e.bold(true).size(true).line(`${it.quantity} x ${it.menu_item_name}`).size(false).bold(false);
    // Instructions are the whole reason a KOT exists — never truncate them.
    if (it.notes?.trim()) {
      for (const chunk of wrap(`* ${it.notes.trim()}`, WIDTH)) e.line(chunk);
    }
  }

  e.line(DIVIDER);
  e.feedAndCut();
  return e.bytes();
}

/** Split text into lines of at most `width` characters, breaking on spaces. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

export function buildReceipt(bill: Bill, cafe?: Cafe | null): Uint8Array {
  const e = new Encoder().init();

  // Header
  e.align("center").bold(true).size(true).line(cafe?.name ?? "Receipt").size(false);
  e.bold(false);
  if (cafe?.address) e.line(cafe.address);
  if (cafe?.phone) e.line(cafe.phone);
  if (cafe?.gst_number) e.line(`GSTIN: ${cafe.gst_number}`);

  // Meta
  e.align("left").line(DIVIDER);
  e.line(`Bill: ${formatBillNo(bill)}`);
  e.line(new Date(bill.created_at).toLocaleString());
  e.line(bill.table_id ? "Dine-in" : "Take away");
  e.line(DIVIDER);

  // Items
  for (const it of bill.items) {
    const qtyName = `${it.quantity} x ${it.menu_item_name}`;
    e.line(row(qtyName, money(it.price * it.quantity)));
  }
  e.line(DIVIDER);

  // Totals
  e.line(row("Subtotal", money(bill.subtotal)));
  if (bill.cgst) e.line(row(`CGST ${bill.cgst_percentage ?? ""}%`, money(bill.cgst)));
  if (bill.sgst) e.line(row(`SGST ${bill.sgst_percentage ?? ""}%`, money(bill.sgst)));
  if (bill.packing_charge) e.line(row("Packing", money(bill.packing_charge)));
  if (bill.delivery_charge) e.line(row("Delivery", money(bill.delivery_charge)));
  e.bold(true).line(row("TOTAL", `Rs ${money(bill.total)}`)).bold(false);
  e.line(row("Paid via", bill.payment_method.toUpperCase()));

  // Footer
  e.align("center").line().line("Thank you! Visit again.");
  e.feedAndCut();

  return e.bytes();
}
