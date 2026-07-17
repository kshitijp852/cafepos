import type { ReactNode } from "react";
import { Minus, Plus, X } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { inr } from "@/lib/format";
import type { OrderItem } from "@/lib/types";

interface Props {
  items: OrderItem[];
  subtotal: number;
  taxPercentage: number;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onRemove: (id: string) => void;
  onNotes?: (id: string, notes: string) => void;
  showNotes?: boolean;
  footer?: ReactNode;
}

export function CartPanel({
  items,
  subtotal,
  taxPercentage,
  onInc,
  onDec,
  onRemove,
  onNotes,
  showNotes = false,
  footer,
}: Props) {
  const tax = subtotal * (taxPercentage / 100);
  const total = subtotal + tax;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {items.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Tap menu items to add them to the order
          </div>
        ) : (
          items.map((item) => (
            <div key={item.menu_item_id} className="border border-border p-3 text-sm">
              <div className="flex justify-between items-start mb-2 gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{item.menu_item_name}</div>
                  <div className="text-muted-foreground text-xs nums">{inr(item.price)} each</div>
                </div>
                <button
                  onClick={() => onRemove(item.menu_item_id)}
                  className="text-muted-foreground hover:text-danger transition-colors"
                  aria-label="Remove item"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onDec(item.menu_item_id)}>
                  <Minus size={13} />
                </Button>
                <span className="flex-1 text-center font-semibold nums">{item.quantity}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onInc(item.menu_item_id)}>
                  <Plus size={13} />
                </Button>
                <div className="text-right font-semibold w-20 nums">{inr(item.price * item.quantity)}</div>
              </div>
              {showNotes && onNotes && (
                <Textarea
                  placeholder="Special instructions…"
                  value={item.notes ?? ""}
                  onChange={(e) => onNotes(item.menu_item_id, e.target.value)}
                  className="mt-2 text-xs resize-none"
                  rows={2}
                />
              )}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border p-4 space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span className="nums">{inr(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Tax ({taxPercentage}%)</span>
          <span className="nums">{inr(tax)}</span>
        </div>
        <Separator />
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium uppercase tracking-wide">Total</span>
          <span className="font-serif text-2xl font-bold nums">{inr(total)}</span>
        </div>
      </div>

      {footer && <div className="p-4 border-t border-border space-y-2">{footer}</div>}
    </div>
  );
}
