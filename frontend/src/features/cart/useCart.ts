import { useCallback, useMemo, useState } from "react";

import type { MenuItem, OrderItem } from "@/lib/types";

/** Shared cart state used by every ordering surface (dashboard, counter, waiter). */
export function useCart(initial: OrderItem[] = []) {
  const [items, setItems] = useState<OrderItem[]>(initial);

  const add = useCallback((menuItem: MenuItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.menu_item_id === menuItem.id);
      if (existing) {
        return prev.map((i) =>
          i.menu_item_id === menuItem.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        { menu_item_id: menuItem.id, menu_item_name: menuItem.name, quantity: 1, price: menuItem.price, notes: "" },
      ];
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.menu_item_id !== id)
        : prev.map((i) => (i.menu_item_id === id ? { ...i, quantity: qty } : i)),
    );
  }, []);

  const inc = useCallback((id: string) => {
    setItems((prev) => prev.map((i) => (i.menu_item_id === id ? { ...i, quantity: i.quantity + 1 } : i)));
  }, []);

  const dec = useCallback((id: string) => {
    setItems((prev) =>
      prev
        .map((i) => (i.menu_item_id === id ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const setNotes = useCallback((id: string, notes: string) => {
    setItems((prev) => prev.map((i) => (i.menu_item_id === id ? { ...i, notes } : i)));
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.menu_item_id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);
  const reset = useCallback((next: OrderItem[]) => setItems(next), []);

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.price * i.quantity, 0), [items]);

  return { items, add, inc, dec, setQty, setNotes, remove, clear, reset, subtotal, count: items.length };
}
