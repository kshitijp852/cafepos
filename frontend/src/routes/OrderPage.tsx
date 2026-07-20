import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer, ShoppingBag } from "@phosphor-icons/react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import { createBill, createOrder, printBill, updateOrder } from "@/api/endpoints";
import { useActiveOrders, useCafe, useCategories, useInvalidate, useMenuItems, useTables } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AnimatedCheck } from "@/components/AnimatedCheck";
import { OfflineStatus } from "@/components/OfflineStatus";
import { PaymentMethodPicker } from "@/features/billing/PaymentMethodPicker";
import { CartPanel } from "@/features/cart/CartPanel";
import { MenuBrowser } from "@/features/cart/MenuBrowser";
import { useCart } from "@/features/cart/useCart";
import { formatBillNo, inr } from "@/lib/format";
import { printReceipt } from "@/lib/printer";
import type { Bill, Cafe, PaymentMethod } from "@/lib/types";

// Print on the device's own thermal printer (works offline); fall back to the
// server-side printer when no local printer is paired.
async function printBillBestEffort(bill: Bill, cafe?: Cafe | null) {
  try {
    await printReceipt(bill, cafe);
  } catch {
    await printBill(bill.id).catch(() => undefined);
  }
}

export function OrderPage() {
  const { tableId } = useParams();
  const isDineIn = !!tableId;
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  const { data: tables = [] } = useTables();
  const { data: menuItems = [] } = useMenuItems();
  const { data: categories = [] } = useCategories();
  const { data: cafe } = useCafe();
  const { orders } = useActiveOrders();

  const table = tables.find((t) => t.id === tableId);
  const existingOrder = isDineIn ? orders.find((o) => o.table_id === tableId) : undefined;

  // Tax comes from cafe settings as a CGST + SGST split.
  const cgstPct = cafe?.cgst_percentage ?? 0;
  const sgstPct = cafe?.sgst_percentage ?? 0;
  const taxPct = cgstPct + sgstPct;

  const cart = useCart();
  const [hydrated, setHydrated] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<Bill | null>(null); // take-away pickup token
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [charges, setCharges] = useState({ packing: 0, delivery: 0 });
  // Centered success popup with the animated tick; runs `then` after it shows.
  const [success, setSuccess] = useState<{ message: string; then: () => void } | null>(null);

  // Seed the cart from an existing dine-in order, once.
  useEffect(() => {
    if (isDineIn && existingOrder && !hydrated) {
      cart.reset(existingOrder.items);
      setHydrated(true);
    }
  }, [isDineIn, existingOrder, hydrated, cart]);

  // Open the settle popup, prefilling take-away charges from cafe defaults.
  const openPay = () => {
    setCharges({
      packing: isDineIn ? 0 : cafe?.packing_charge ?? 0,
      delivery: isDineIn ? 0 : cafe?.delivery_charge ?? 0,
    });
    setPayOpen(true);
  };

  const title = isDineIn ? `Table ${table?.name ?? ""}` : "Take Away";
  const subtitle = isDineIn ? "Dine-in order" : "Counter / pickup";
  const orderTotal = cart.subtotal + cart.subtotal * (taxPct / 100);

  const saveOrder = async () => {
    if (cart.count === 0) return toast.error("Add items first.");
    setBusy(true);
    try {
      if (existingOrder) await updateOrder(existingOrder.id, cart.items);
      else await createOrder({ table_id: tableId, items: cart.items, status: "active" });
      await invalidate(["orders", "tables"]);
      setSuccess({ message: "Order saved", then: () => navigate("/dashboard") });
    } catch (err) {
      toast.error(errorMessage(err, "Failed to save order"));
    } finally {
      setBusy(false);
    }
  };

  const settle = async () => {
    if (cart.count === 0) return;
    const name = customer.name.trim();
    const phoneDigits = customer.phone.replace(/\D/g, "");
    if (!name) return toast.error("Enter the customer's name.");
    if (phoneDigits.length < 8) return toast.error("Enter a valid phone number.");
    setBusy(true);
    try {
      const bill = await createBill({
        table_id: tableId ?? null,
        items: cart.items,
        packing_charge: isDineIn ? 0 : charges.packing,
        delivery_charge: isDineIn ? 0 : charges.delivery,
        payment_method: method,
        order_id: existingOrder?.id ?? null,
        customer_name: customer.name.trim() || undefined,
        customer_phone: customer.phone.trim() || undefined,
      });
      await printBillBestEffort(bill, cafe);
      await invalidate(["orders", "tables", "bills", "report"]);
      setPayOpen(false);
      if (isDineIn) {
        setSuccess({ message: `Bill #${formatBillNo(bill)} settled`, then: () => navigate("/dashboard") });
      } else {
        cart.clear();
        setCustomer({ name: "", phone: "" });
        setPlaced(bill);
      }
    } catch (err) {
      toast.error(errorMessage(err, "Failed to settle"));
    } finally {
      setBusy(false);
    }
  };

  // Take-away success screen (pickup token).
  if (placed) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <AnimatedCheck size={64} />
        <div>
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Pickup number</p>
          <p className="font-heading text-6xl font-bold nums">#{formatBillNo(placed)}</p>
        </div>
        <p className="max-w-xs text-sm text-muted-foreground">
          Call this number when the order is ready for collection.
        </p>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={() => placed && printBillBestEffort(placed, cafe)}>
            <Printer size={16} /> Print again
          </Button>
          <Button onClick={() => setPlaced(null)}>New take-away</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:px-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
          <ArrowLeft size={18} /> {isDineIn ? "Floor" : "Back"}
        </Button>
        <div className="mx-1 h-8 w-px bg-border" />
        {isDineIn ? (
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center bg-primary font-heading text-lg font-bold text-primary-foreground">
              {table?.name ?? "—"}
            </div>
            <div>
              <h1 className="font-heading text-xl font-bold leading-tight">{title}</h1>
              <p className="text-xs text-muted-foreground">
                {table?.capacity ? `${table.capacity} seats · ` : ""}
                {existingOrder ? "order in progress" : "new order"}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center border border-border">
              <ShoppingBag size={22} />
            </div>
            <div>
              <h1 className="font-heading text-xl font-bold leading-tight">{title}</h1>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          <OfflineStatus />
          {isDineIn && existingOrder && <Badge variant="warning">In progress</Badge>}
          <div className="flex items-center gap-3 border border-border px-3 py-1.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {cart.count} item{cart.count === 1 ? "" : "s"}
            </span>
            <span className="font-heading text-lg font-bold nums">{inr(orderTotal)}</span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Menu */}
        <div className="hidden flex-1 border-r border-border md:block">
          <MenuBrowser items={menuItems} categories={categories} onAdd={cart.add} onlyAvailable />
        </div>

        {/* Cart column */}
        <div className="flex w-full flex-col md:w-[380px]">
          <CartPanel
            items={cart.items}
            subtotal={cart.subtotal}
            taxPercentage={taxPct}
            onInc={cart.inc}
            onDec={cart.dec}
            onRemove={cart.remove}
            onNotes={cart.setNotes}
            showNotes={isDineIn}
            footer={
              isDineIn ? (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={saveOrder} disabled={busy || cart.count === 0}>
                    Save
                  </Button>
                  <Button variant="success" className="flex-1" onClick={openPay} disabled={cart.count === 0}>
                    Settle · {inr(orderTotal)}
                  </Button>
                </div>
              ) : (
                <Button variant="success" className="w-full" size="lg" onClick={openPay} disabled={cart.count === 0}>
                  Checkout · {inr(orderTotal)}
                </Button>
              )
            }
          />
        </div>
      </div>

      {/* Settle popup (centered) */}
      <Dialog open={payOpen} onOpenChange={(o) => !o && !busy && setPayOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{isDineIn ? "Settle bill" : "Checkout"}</DialogTitle>
          </DialogHeader>
          <PayFields
            subtotal={cart.subtotal}
            cgstPct={cgstPct}
            sgstPct={sgstPct}
            isDineIn={isDineIn}
            charges={charges}
            setCharges={setCharges}
            method={method}
            setMethod={setMethod}
            customer={customer}
            setCustomer={setCustomer}
            busy={busy}
            onConfirm={settle}
          />
        </DialogContent>
      </Dialog>

      {/* Success popup with animated tick */}
      <SuccessDialog success={success} onDone={() => { const t = success?.then; setSuccess(null); t?.(); }} />
    </div>
  );
}

// Centered success popup: shows the animated tick briefly, then runs onDone.
function SuccessDialog({ success, onDone }: { success: { message: string } | null; onDone: () => void }) {
  useEffect(() => {
    if (!success) return;
    const id = setTimeout(onDone, 1400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success]);
  return (
    <Dialog open={!!success}>
      <DialogContent className="sm:max-w-xs" hideClose>
        <DialogTitle className="sr-only">{success?.message ?? "Success"}</DialogTitle>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <AnimatedCheck size={72} />
          <p className="font-heading text-xl font-bold">{success?.message}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PayFields({
  subtotal,
  cgstPct,
  sgstPct,
  isDineIn,
  charges,
  setCharges,
  method,
  setMethod,
  customer,
  setCustomer,
  busy,
  onConfirm,
}: {
  subtotal: number;
  cgstPct: number;
  sgstPct: number;
  isDineIn: boolean;
  charges: { packing: number; delivery: number };
  setCharges: (c: { packing: number; delivery: number }) => void;
  method: PaymentMethod;
  setMethod: (m: PaymentMethod) => void;
  customer: { name: string; phone: string };
  setCustomer: (c: { name: string; phone: string }) => void;
  busy: boolean;
  onConfirm: () => void;
}) {
  const cgst = subtotal * (cgstPct / 100);
  const sgst = subtotal * (sgstPct / 100);
  const packing = isDineIn ? 0 : charges.packing;
  const delivery = isDineIn ? 0 : charges.delivery;
  const total = subtotal + cgst + sgst + packing + delivery;
  const canConfirm = customer.name.trim().length > 0 && customer.phone.replace(/\D/g, "").length >= 8;
  const money = (n: string) => Math.max(0, parseFloat(n) || 0);
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Label>Payment method</Label>
        <PaymentMethodPicker value={method} onChange={setMethod} />
      </div>

      {!isDineIn && (
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div className="space-y-1">
            <Label>Packing charge</Label>
            <Input
              type="number"
              min={0}
              value={charges.packing}
              onChange={(e) => setCharges({ ...charges, packing: money(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label>Delivery charge</Label>
            <Input
              type="number"
              min={0}
              value={charges.delivery}
              onChange={(e) => setCharges({ ...charges, delivery: money(e.target.value) })}
            />
          </div>
        </div>
      )}

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer details</p>
        <Input
          placeholder="Name"
          value={customer.name}
          onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
        />
        <Input
          type="tel"
          inputMode="tel"
          placeholder="Phone (for WhatsApp)"
          value={customer.phone}
          onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
        />
      </div>

      <div className="space-y-1 border-t border-border pt-4 text-sm">
        <Row label="Subtotal" value={inr(subtotal)} />
        {cgstPct > 0 && <Row label={`CGST ${cgstPct}%`} value={inr(cgst)} muted />}
        {sgstPct > 0 && <Row label={`SGST ${sgstPct}%`} value={inr(sgst)} muted />}
        {packing > 0 && <Row label="Packing" value={inr(packing)} muted />}
        {delivery > 0 && <Row label="Delivery" value={inr(delivery)} muted />}
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-sm font-medium uppercase tracking-wide">Total</span>
          <span className="font-heading text-2xl font-bold nums">{inr(total)}</span>
        </div>
      </div>

      <Button variant="success" className="w-full" size="lg" onClick={onConfirm} disabled={busy || !canConfirm}>
        <Printer size={16} /> {busy ? "Processing…" : "Confirm & Print"}
      </Button>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span className="nums">{value}</span>
    </div>
  );
}
