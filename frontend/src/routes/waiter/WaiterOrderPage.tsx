import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, PaperPlaneTilt, Trash } from "@phosphor-icons/react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import { createOrder } from "@/api/endpoints";
import { useCategories, useMenuItems, useTables } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { CartPanel } from "@/features/cart/CartPanel";
import { MenuBrowser } from "@/features/cart/MenuBrowser";
import { useCart } from "@/features/cart/useCart";
import type { Table } from "@/lib/types";

export function WaiterOrderPage() {
  const { tableId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const { data: menuItems = [] } = useMenuItems();
  const { data: categories = [] } = useCategories();
  const { data: tables = [] } = useTables();

  const table: Table | undefined =
    (location.state as { table?: Table } | null)?.table ?? tables.find((t) => t.id === tableId);

  const cart = useCart();
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (cart.count === 0) return toast.error("Add items to the order");
    setSending(true);
    try {
      // Waiter attribution is stamped server-side from the device's assignment.
      await createOrder({
        table_id: tableId,
        items: cart.items,
        status: "pending",
      });
      toast.success(`Order sent for ${table?.name ?? "table"}`);
      navigate("/waiter/tables");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to send order"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex h-16 items-center gap-3 border-b border-border bg-card px-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/waiter/tables")}>
          <ArrowLeft size={18} />
          Tables
        </Button>
        <h1 className="font-serif text-xl font-bold">Table {table?.name ?? tableId}</h1>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 border-r overflow-hidden">
          <MenuBrowser items={menuItems} categories={categories} onAdd={cart.add} onlyAvailable />
        </div>
        <div className="w-96 flex flex-col">
          <CartPanel
            items={cart.items}
            subtotal={cart.subtotal}
            taxPercentage={0}
            onInc={cart.inc}
            onDec={cart.dec}
            onRemove={cart.remove}
            onNotes={cart.setNotes}
            showNotes
            footer={
              <>
                <Button variant="success" className="w-full" size="lg" onClick={send} disabled={sending || cart.count === 0}>
                  <PaperPlaneTilt size={18} />
                  {sending ? "Sending…" : "Send to Kitchen"}
                </Button>
                {cart.count > 0 && (
                  <Button variant="ghost" className="w-full text-danger" onClick={cart.clear}>
                    <Trash size={16} />
                    Clear
                  </Button>
                )}
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
