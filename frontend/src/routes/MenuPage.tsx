import { useRef, useState } from "react";
import { Warning, PencilSimple, Plus, Trash, UploadSimple } from "@phosphor-icons/react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import {
  confirmMenuPurge,
  createCategory,
  createMenuItem,
  deleteMenuItem,
  requestMenuPurge,
  updateCafe,
  updateMenuItem,
  type MenuItemInput,
} from "@/api/endpoints";
import { useCafe, useCategories, useInvalidate, useMenuItems } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FoodTypeMarker } from "@/components/FoodTypeMarker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseCsv } from "@/lib/csv";
import { inr } from "@/lib/format";
import type { FoodType, MenuItem } from "@/lib/types";

const EMPTY: MenuItemInput = { name: "", price: 0, category_id: "", description: "", available: true, food_type: null };
const FOOD_NONE = "none";

export function MenuPage() {
  const { data: categories = [] } = useCategories();
  const { data: items = [] } = useMenuItems();
  const { data: cafe } = useCafe();
  const invalidate = useInvalidate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [newCategory, setNewCategory] = useState("");
  const [itemForm, setItemForm] = useState<MenuItemInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Bulk-delete (OTP-gated) state.
  const [purge, setPurge] = useState<{ open: boolean; step: "intro" | "otp"; otp: string; busy: boolean }>(
    { open: false, step: "intro", otp: "", busy: false },
  );

  const sendPurgeCode = async () => {
    setPurge((p) => ({ ...p, busy: true }));
    try {
      const res = await requestMenuPurge();
      toast.success(res.message);
      const prefill = res.dev_otp ?? "";
      if (res.dev_otp) toast.message(`Dev mode: code is ${res.dev_otp}`);
      setPurge((p) => ({ ...p, step: "otp", otp: prefill, busy: false }));
    } catch (err) {
      toast.error(errorMessage(err, "Could not send code"));
      setPurge((p) => ({ ...p, busy: false }));
    }
  };

  const doPurge = async () => {
    if (purge.otp.length !== 6) return toast.error("Enter the 6-digit code.");
    setPurge((p) => ({ ...p, busy: true }));
    try {
      const res = await confirmMenuPurge(purge.otp);
      await invalidate(["menuItems", "categories"]);
      toast.success(`Deleted ${res.deleted_items} item(s) and ${res.deleted_categories} categor(ies).`);
      setPurge({ open: false, step: "intro", otp: "", busy: false });
    } catch (err) {
      toast.error(errorMessage(err, "Delete failed"));
      setPurge((p) => ({ ...p, busy: false }));
    }
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      await createCategory({ name: newCategory.trim() });
      setNewCategory("");
      await invalidate(["categories"]);
      toast.success("Category added");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to add category"));
    }
  };

  const openNew = () => {
    setEditingId(null);
    setItemForm({ ...EMPTY, category_id: categories[0]?.id ?? "" });
  };
  const openEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setItemForm({
      name: item.name,
      price: item.price,
      category_id: item.category_id,
      description: item.description ?? "",
      available: item.available,
      food_type: item.food_type ?? null,
    });
  };

  const saveItem = async () => {
    if (!itemForm) return;
    if (!itemForm.name.trim() || !itemForm.category_id) return toast.error("Name and category are required");
    try {
      if (editingId) await updateMenuItem(editingId, itemForm);
      else await createMenuItem(itemForm);
      setItemForm(null);
      await invalidate(["menuItems"]);
      toast.success("Menu item saved");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to save item"));
    }
  };

  const removeItem = async (item: MenuItem) => {
    try {
      await deleteMenuItem(item.id);
      await invalidate(["menuItems"]);
      toast.success("Item deleted");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to delete item"));
    }
  };

  const handleCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error("CSV needs a header row and at least one data row");

      const header = rows[0].map((h) => h.trim().toLowerCase());
      const nameIdx = header.findIndex((h) => h.includes("name") || h.includes("item"));
      const priceIdx = header.findIndex((h) => h.includes("price") || h.includes("cost"));
      const catIdx = header.findIndex((h) => h.includes("category"));
      if (nameIdx === -1 || priceIdx === -1) throw new Error('CSV must have "name" and "price" columns');

      // Real dedup: skip names already on the menu (case-insensitive) and reuse categories.
      const existingNames = new Set(items.map((i) => i.name.toLowerCase()));
      const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

      let created = 0;
      let skipped = 0;
      for (const row of rows.slice(1)) {
        const name = (row[nameIdx] ?? "").trim();
        const price = parseFloat(row[priceIdx]);
        const catName = (catIdx >= 0 ? row[catIdx] : "")?.trim() || "General";
        if (!name || Number.isNaN(price) || existingNames.has(name.toLowerCase())) {
          skipped++;
          continue;
        }
        let categoryId = categoryByName.get(catName.toLowerCase());
        if (!categoryId) {
          const cat = await createCategory({ name: catName });
          categoryId = cat.id;
          categoryByName.set(catName.toLowerCase(), cat.id);
        }
        await createMenuItem({ name, price, category_id: categoryId, available: true });
        existingNames.add(name.toLowerCase());
        created++;
      }

      await invalidate(["menuItems", "categories"]);
      toast.success(`Imported ${created} item(s)${skipped ? `, skipped ${skipped}` : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "CSV import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";
  const sortedItems = [...items].sort(
    (a, b) => catName(a.category_id).localeCompare(catName(b.category_id)) || a.name.localeCompare(b.name),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold">Menu</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"} across {categories.length} categor
            {categories.length === 1 ? "y" : "ies"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={handleCsv} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
            <UploadSimple size={16} />
            {importing ? "Importing…" : "Import CSV"}
          </Button>
          <Button onClick={openNew} disabled={categories.length === 0}>
            <Plus size={16} /> Add item
          </Button>
          <Button
            variant="outline"
            className="text-danger border-danger/40 hover:bg-danger/10"
            disabled={items.length === 0}
            onClick={() => setPurge({ open: true, step: "intro", otp: "", busy: false })}
            aria-label="Delete entire menu"
          >
            <Trash size={16} />
          </Button>
        </div>
      </div>

      {/* Categories */}
      <section className="border border-border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Categories</h2>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Badge key={c.id} variant="secondary">
                {c.name}
              </Badge>
            ))}
            {categories.length === 0 && <span className="text-sm text-muted-foreground">No categories yet.</span>}
          </div>
          <div className="flex max-w-sm gap-2">
            <Input
              placeholder="New category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
            />
            <Button variant="outline" onClick={addCategory}>
              <Plus size={16} /> Add
            </Button>
          </div>
        </div>
      </section>

      {/* Charges & taxes */}
      {cafe && <ChargesCard cafe={cafe} onSaved={() => invalidate(["cafe"])} />}

      {/* Items table */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Items</h2>
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="px-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="px-4">
                    <div className="flex items-center gap-2">
                      <FoodTypeMarker type={item.food_type} />
                      <span className="font-medium">{item.name}</span>
                    </div>
                    {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{catName(item.category_id)}</TableCell>
                  <TableCell className="text-right font-semibold nums">{inr(item.price)}</TableCell>
                  <TableCell>
                    <Badge variant={item.available ? "success" : "outline"}>
                      {item.available ? "Available" : "Hidden"}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label="Edit item" onClick={() => openEdit(item)}>
                        <PencilSimple size={17} />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-danger" aria-label="Delete item" onClick={() => removeItem(item)}>
                        <Trash size={17} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No items yet. Import a CSV or add one above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Item form dialog */}
      <Dialog open={!!itemForm} onOpenChange={(o) => !o && setItemForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Item" : "New Item"}</DialogTitle>
          </DialogHeader>
          {itemForm && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Price</Label>
                <Input
                  type="number"
                  value={itemForm.price}
                  onChange={(e) => setItemForm({ ...itemForm, price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={itemForm.category_id} onValueChange={(v) => setItemForm({ ...itemForm, category_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Food type</Label>
                <Select
                  value={itemForm.food_type ?? FOOD_NONE}
                  onValueChange={(v) =>
                    setItemForm({ ...itemForm, food_type: v === FOOD_NONE ? null : (v as FoodType) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FOOD_NONE}>No tag</SelectItem>
                    <SelectItem value="veg">Veg</SelectItem>
                    <SelectItem value="non_veg">Non-veg</SelectItem>
                    <SelectItem value="egg">Egg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input
                  value={itemForm.description ?? ""}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemForm(null)}>
              Cancel
            </Button>
            <Button onClick={saveItem}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete-all (OTP-gated) dialog */}
      <Dialog open={purge.open} onOpenChange={(o) => !purge.busy && setPurge((p) => ({ ...p, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-danger">
              <Warning className="w-5 h-5" /> Delete entire menu
            </DialogTitle>
          </DialogHeader>

          {purge.step === "intro" ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                This permanently deletes <b>all {items.length} menu items and their categories</b>. It
                can&apos;t be undone.
              </p>
              <p>
                To confirm it&apos;s really you, we&apos;ll email a 6-digit code to your registered address.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Enter the 6-digit code we emailed you.</p>
              <div className="space-y-1">
                <Label htmlFor="purge-otp">Confirmation code</Label>
                <Input
                  id="purge-otp"
                  inputMode="numeric"
                  maxLength={6}
                  className="text-center text-lg tracking-[0.4em]"
                  value={purge.otp}
                  onChange={(e) => setPurge((p) => ({ ...p, otp: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                  onKeyDown={(e) => e.key === "Enter" && doPurge()}
                />
              </div>
              <button
                type="button"
                className="text-xs text-foreground hover:underline disabled:opacity-50"
                onClick={sendPurgeCode}
                disabled={purge.busy}
              >
                Resend code
              </button>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPurge((p) => ({ ...p, open: false }))} disabled={purge.busy}>
              Cancel
            </Button>
            {purge.step === "intro" ? (
              <Button
                variant="destructive"
                onClick={sendPurgeCode}
                disabled={purge.busy}
              >
                {purge.busy ? "Sending…" : "Email me a code"}
              </Button>
            ) : (
              <Button variant="destructive" onClick={doPurge} disabled={purge.busy}>
                {purge.busy ? "Deleting…" : "Delete everything"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChargesCard({ cafe, onSaved }: { cafe: import("@/lib/types").Cafe; onSaved: () => void }) {
  const [form, setForm] = useState({
    cgst: String(cafe.cgst_percentage ?? 0),
    sgst: String(cafe.sgst_percentage ?? 0),
    packing: String(cafe.packing_charge ?? 0),
    delivery: String(cafe.delivery_charge ?? 0),
  });
  const [busy, setBusy] = useState(false);

  const num = (v: string) => Math.max(0, parseFloat(v) || 0);
  const save = async () => {
    setBusy(true);
    try {
      await updateCafe({
        cgst_percentage: num(form.cgst),
        sgst_percentage: num(form.sgst),
        packing_charge: num(form.packing),
        delivery_charge: num(form.delivery),
      });
      onSaved();
      toast.success("Charges & taxes updated");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to save charges"));
    } finally {
      setBusy(false);
    }
  };

  const totalTax = num(form.cgst) + num(form.sgst);

  return (
    <section className="border border-border">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Charges &amp; taxes</h2>
        <p className="text-xs text-muted-foreground">
          Applied at settlement. Packing/delivery are for take-away &amp; delivery; dine-in is exempt.
        </p>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label>CGST %</Label>
          <Input type="number" min={0} step="0.01" value={form.cgst} onChange={(e) => setForm({ ...form, cgst: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>SGST %</Label>
          <Input type="number" min={0} step="0.01" value={form.sgst} onChange={(e) => setForm({ ...form, sgst: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Packing charge (pc)</Label>
          <Input type="number" min={0} step="0.01" value={form.packing} onChange={(e) => setForm({ ...form, packing: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Delivery charge (dc)</Label>
          <Input type="number" min={0} step="0.01" value={form.delivery} onChange={(e) => setForm({ ...form, delivery: e.target.value })} />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <span className="text-xs text-muted-foreground">Total GST: <span className="font-semibold text-foreground nums">{totalTax}%</span></span>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save charges"}</Button>
      </div>
    </section>
  );
}
