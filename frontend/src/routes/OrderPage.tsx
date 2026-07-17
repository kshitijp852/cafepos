import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, Printer, ShoppingBag } from "@phosphor-icons/react";
import { toast } from "sonner";

import { errorMessage } from "@/api/client";
import { createBill, createOrder, printBill, updateOrder } from "@/api/endpoints";
import { useActiveOrders, useCategories, useInvalidate, useMenuItems, useTables } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaymentMethodPicker } from "@/features/billing/PaymentMethodPicker";
import { CartPanel } from "@/features/cart/CartPanel";
import { MenuBrowser } from "@/features/cart/MenuBrowser";
import { useCart } from "@/features/cart/useCart";
import { inr } from "@/lib/format";
import type { Bill, PaymentMethod } from "@/lib/types";

const TAX_OPTIONS = ["0", "5", "12", "18"];

export function OrderPage() {
  const { tableId } = useParams();
  const isDineIn = !!tableId;
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  const { data: tables = [] } = useTables();
  const { data: menuItems = [] } = useMenuItems();
  const { data: categories = [] } = useCategories();
  const { orders } = useActiveOrders();

  const table = tables.find((t) => t.id === tableId);
  const existingOrder = isDineIn ? orders.find((o) => o.table_id === tableId) : undefined;

  const cart = useCart();
  const [hydrated, setHydrated] = useState(false);
  const [tax, setTax] = useState(5);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [step, setStep] = useState<"cart" | "pay">("cart");
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<Bill | null>(null); // take-away pickup token

  // Seed the cart from an existing dine-in order, once.
  useEffect(() => {
    if (isDineIn && existingOrder && !hydrated) {
      cart.reset(existingOrder.items);
      setTax(existingOrder.tax_percentage ?? 5);
      setHydrated(true);
    }
  }, [isDineIn, existingOrder, hydrated, cart]);

  const title = isDineIn ? `Table ${table?.name ?? ""}` : "Take Away";
  const subtitle = isDineIn ? "Dine-in order" : "Counter / pickup";
  const orderTotal = cart.subtotal + cart.subtotal * (tax / 100);

  const saveOrder = async () => {
    if (cart.count === 0) return toast.error("Add items first.");
    setBusy(true);
    try {
      if (existingOrder) await updateOrder(existingOrder.id, cart.items);
      else await createOrder({ table_id: tableId, items: cart.items, status: "active" });
      toast.success("Order saved");
      await invalidate(["orders", "tables"]);
      navigate("/dashboard");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to save order"));
    } finally {
      setBusy(false);
    }
  };

  const settle = async () => {
    if (cart.count === 0) return;
    setBusy(true);
    try {
      const bill = await createBill({
        table_id: tableId ?? null,
        items: cart.items,
        tax_percentage: tax,
        payment_method: method,
        order_id: existingOrder?.id ?? null,
      });
      await printBill(bill.id).catch(() => undefined);
      await invalidate(["orders", "tables", "bills", "report"]);
      if (isDineIn) {
        toast.success(`Bill #${bill.bill_number} settled`);
        navigate("/dashboard");
      } else {
        cart.clear();
        setStep("cart");
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
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle size={48} weight="fill" className="text-success" />
        <div>
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Pickup number</p>
          <p className="font-serif text-6xl font-bold nums">#{placed.bill_number}</p>
        </div>
        <p className="max-w-xs text-sm text-muted-foreground">
          Call this number when the order is ready for collection.
        </p>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={() => placed && printBill(placed.id)}>
            <Printer size={16} /> Print again
          </Button>
          <Button onClick={() => setPlaced(null)}>New take-away</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:px-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
          <ArrowLeft size={18} /> {isDineIn ? "Floor" : "Back"}
        </Button>
        <div className="mx-1 h-8 w-px bg-border" />
        {isDineIn ? (
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center bg-primary font-serif text-lg font-bold text-primary-foreground">
              {table?.name ?? "—"}
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold leading-tight">{title}</h1>
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
              <h1 className="font-serif text-xl font-bold leading-tight">{title}</h1>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          {isDineIn && existingOrder && <Badge variant="warning">In progress</Badge>}
          <div className="flex items-center gap-3 border border-border px-3 py-1.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {cart.count} item{cart.count === 1 ? "" : "s"}
            </span>
            <span className="font-serif text-lg font-bold nums">{inr(orderTotal)}</span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Menu */}
        <div className="hidden flex-1 border-r border-border md:block">
          <MenuBrowser items={menuItems} categories={categories} onAdd={cart.add} onlyAvailable />
        </div>

        {/* Cart / pay column */}
        <div className="flex w-full flex-col md:w-[380px]">
          {step === "cart" ? (
            <CartPanel
              items={cart.items}
              subtotal={cart.subtotal}
              taxPercentage={tax}
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
                    <Button variant="success" className="flex-1" onClick={() => setStep("pay")} disabled={cart.count === 0}>
                      Settle · {inr(orderTotal)}
                    </Button>
                  </div>
                ) : (
                  <Button variant="success" className="w-full" size="lg" onClick={() => setStep("pay")} disabled={cart.count === 0}>
                    Checkout · {inr(orderTotal)}
                  </Button>
                )
              }
            />
          ) : (
            <PayStep
              subtotal={cart.subtotal}
              tax={tax}
              setTax={setTax}
              method={method}
              setMethod={setMethod}
              busy={busy}
              onBack={() => setStep("cart")}
              onConfirm={settle}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PayStep({
  subtotal,
  tax,
  setTax,
  method,
  setMethod,
  busy,
  onBack,
  onConfirm,
}: {
  subtotal: number;
  tax: number;
  setTax: (n: number) => void;
  method: PaymentMethod;
  setMethod: (m: PaymentMethod) => void;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const taxAmt = subtotal * (tax / 100);
  const total = subtotal + taxAmt;
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-auto p-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Tax</label>
          <Select value={String(tax)} onValueChange={(v) => setTax(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}% {t === "0" ? "(No tax)" : "GST"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Payment method
          </label>
          <PaymentMethodPicker value={method} onChange={setMethod} />
        </div>
      </div>

      <div className="border-t border-border p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium uppercase tracking-wide">Total</span>
          <span className="font-serif text-2xl font-bold nums">{inr(total)}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onBack} disabled={busy}>
            Back
          </Button>
          <Button variant="success" className="flex-1" onClick={onConfirm} disabled={busy}>
            <Printer size={16} /> Settle & Print
          </Button>
        </div>
      </div>
    </div>
  );
}
