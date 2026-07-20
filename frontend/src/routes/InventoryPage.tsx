import { useState } from "react";
import { Minus, Plus, Stack } from "@phosphor-icons/react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import { createInventoryItem, updateInventoryItem, type InventoryInput } from "@/api/endpoints";
import { useInventory, useInvalidate } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr } from "@/lib/format";

const EMPTY: InventoryInput = {
  name: "",
  unit: "",
  current_stock: 0,
  min_stock: 0,
  max_stock: 0,
  cost_per_unit: 0,
};

export function InventoryPage() {
  const { data: items = [] } = useInventory();
  const invalidate = useInvalidate();
  const [form, setForm] = useState<InventoryInput>(EMPTY);

  const set = <K extends keyof InventoryInput>(k: K, v: InventoryInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const add = async () => {
    if (!form.name.trim() || !form.unit.trim()) return toast.error("Name and unit are required");
    try {
      await createInventoryItem(form);
      setForm(EMPTY);
      await invalidate(["inventory"]);
      toast.success("Inventory item added");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to add item"));
    }
  };

  const restock = async (id: string, current_stock: number) => {
    try {
      await updateInventoryItem(id, { current_stock: Math.max(0, current_stock) });
      await invalidate(["inventory"]);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to update stock"));
    }
  };

  const lowCount = items.filter((it) => it.current_stock <= it.min_stock).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Track stock levels{lowCount > 0 ? ` — ${lowCount} item${lowCount > 1 ? "s" : ""} low` : ""}.
        </p>
      </div>

      {/* Add item */}
      <section className="border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Stack size={18} />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Add item</h2>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Unit</Label>
            <Input placeholder="kg, litres, packets…" value={form.unit} onChange={(e) => set("unit", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Cost / unit</Label>
            <Input type="number" value={form.cost_per_unit} onChange={(e) => set("cost_per_unit", parseFloat(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>Current stock</Label>
            <Input type="number" value={form.current_stock} onChange={(e) => set("current_stock", parseFloat(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>Min stock</Label>
            <Input type="number" value={form.min_stock} onChange={(e) => set("min_stock", parseFloat(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>Max stock</Label>
            <Input type="number" value={form.max_stock} onChange={(e) => set("max_stock", parseFloat(e.target.value) || 0)} />
          </div>
          <div className="flex items-end">
            <Button onClick={add} className="w-full">
              <Plus size={16} /> Add item
            </Button>
          </div>
        </div>
      </section>

      {/* Stock table */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Stock</h2>
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Item</TableHead>
                <TableHead className="text-right">In stock</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="px-4 text-right">Adjust</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => {
                const low = it.current_stock <= it.min_stock;
                return (
                  <TableRow key={it.id}>
                    <TableCell className="px-4 font-medium">{it.name}</TableCell>
                    <TableCell className="text-right nums">
                      {it.current_stock} {it.unit}
                    </TableCell>
                    <TableCell className="text-right nums text-muted-foreground">
                      {inr(it.cost_per_unit)}/{it.unit}
                    </TableCell>
                    <TableCell>
                      <Badge variant={low ? "danger" : "success"}>{low ? "Low" : "OK"}</Badge>
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Decrease" onClick={() => restock(it.id, it.current_stock - 1)}>
                          <Minus size={14} />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Increase" onClick={() => restock(it.id, it.current_stock + 1)}>
                          <Plus size={14} />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => restock(it.id, it.max_stock)}>
                          Refill
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No inventory items yet.
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
