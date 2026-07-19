import { useState } from "react";
import { GridFour, Stack, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import { createFloor, createTable, createTablesBulk, deleteTable, updateTable } from "@/api/endpoints";
import { useFloors, useInvalidate, useTables } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Table } from "@/lib/types";

export function TablesPage() {
  const { data: floors = [] } = useFloors();
  const { data: tables = [] } = useTables();
  const invalidate = useInvalidate();

  const [floorName, setFloorName] = useState("");
  const [busyFloor, setBusyFloor] = useState(false);

  const [table, setTable] = useState({ name: "", floor_id: "", capacity: "4" });
  const [busyTable, setBusyTable] = useState(false);

  const [bulk, setBulk] = useState({ floor_id: "", prefix: "T", start: "1", count: "10", capacity: "4" });
  const [busyBulk, setBusyBulk] = useState(false);

  // Editing an existing table (name / seats / floor).
  const [edit, setEdit] = useState<{ id: string; name: string; floor_id: string; capacity: string } | null>(null);
  const [busyEdit, setBusyEdit] = useState(false);

  const openEdit = (t: Table) =>
    setEdit({ id: t.id, name: t.name, floor_id: t.floor_id, capacity: String(t.capacity) });

  const removeTable = async () => {
    if (!edit) return;
    if (!confirm(`Delete table "${edit.name}"? This can't be undone.`)) return;
    setBusyEdit(true);
    try {
      await deleteTable(edit.id);
      toast.success("Table deleted");
      await invalidate(["tables"]);
      setEdit(null);
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete table"));
    } finally {
      setBusyEdit(false);
    }
  };

  const saveEdit = async () => {
    if (!edit) return;
    const name = edit.name.trim();
    const capacity = parseInt(edit.capacity, 10);
    if (!name) return toast.error("Enter a table name/number.");
    if (!edit.floor_id) return toast.error("Pick a floor.");
    if (Number.isNaN(capacity) || capacity < 1) return toast.error("Seats must be at least 1.");
    setBusyEdit(true);
    try {
      await updateTable(edit.id, { name, floor_id: edit.floor_id, capacity });
      toast.success("Table updated");
      await invalidate(["tables"]);
      setEdit(null);
    } catch (err) {
      toast.error(errorMessage(err, "Could not update table"));
    } finally {
      setBusyEdit(false);
    }
  };

  const addFloor = async () => {
    const name = floorName.trim();
    if (!name) return toast.error("Enter a floor name.");
    setBusyFloor(true);
    try {
      const floor = await createFloor({ name });
      toast.success(`Floor "${name}" added`);
      setFloorName("");
      // Preselect the new floor so the next step (adding tables) flows naturally.
      setTable((t) => ({ ...t, floor_id: t.floor_id || floor.id }));
      setBulk((b) => ({ ...b, floor_id: b.floor_id || floor.id }));
      await invalidate(["floors"]);
    } catch (err) {
      toast.error(errorMessage(err, "Could not add floor"));
    } finally {
      setBusyFloor(false);
    }
  };

  const addTable = async () => {
    const name = table.name.trim();
    const capacity = parseInt(table.capacity, 10);
    if (!name) return toast.error("Enter a table name/number.");
    if (!table.floor_id) return toast.error("Pick a floor.");
    if (Number.isNaN(capacity) || capacity < 1) return toast.error("Capacity must be at least 1.");
    setBusyTable(true);
    try {
      await createTable({ name, floor_id: table.floor_id, capacity });
      toast.success(`Table "${name}" added`);
      setTable((t) => ({ ...t, name: "" })); // keep floor + capacity for fast repeat entry
      await invalidate(["tables"]);
    } catch (err) {
      toast.error(errorMessage(err, "Could not add table"));
    } finally {
      setBusyTable(false);
    }
  };

  const addBulk = async () => {
    const count = parseInt(bulk.count, 10);
    const start = parseInt(bulk.start, 10);
    const capacity = parseInt(bulk.capacity, 10);
    if (!bulk.floor_id) return toast.error("Pick a floor.");
    if (Number.isNaN(count) || count < 1 || count > 100) return toast.error("Count must be 1–100.");
    if (Number.isNaN(start) || start < 0) return toast.error("Start number must be 0 or more.");
    if (Number.isNaN(capacity) || capacity < 1) return toast.error("Seats must be at least 1.");
    setBusyBulk(true);
    try {
      await createTablesBulk({
        floor_id: bulk.floor_id,
        count,
        capacity,
        prefix: bulk.prefix,
        start,
      });
      await invalidate(["tables"]);
    } catch (err) {
      toast.error(errorMessage(err, "Could not add tables"));
    } finally {
      setBusyBulk(false);
    }
  };

  // Preview of the names a bulk run will produce, e.g. "T1, T2, T3 … T10".
  const bulkPreview = (() => {
    const start = parseInt(bulk.start, 10);
    const count = parseInt(bulk.count, 10);
    if (Number.isNaN(start) || Number.isNaN(count) || count < 1) return "";
    const names = Array.from({ length: Math.min(count, 100) }, (_, i) => `${bulk.prefix}${start + i}`);
    return names.length <= 4 ? names.join(", ") : `${names.slice(0, 3).join(", ")} … ${names[names.length - 1]}`;
  })();

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Floors &amp; Tables</h1>
          <p className="text-sm text-muted-foreground">
            Set up your seating layout. Add floors first, then add tables to each floor.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Add floor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Stack className="w-5 h-5 text-foreground" /> 1. Add a floor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="floor-name">Floor name</Label>
                <Input
                  id="floor-name"
                  placeholder="Ground Floor"
                  value={floorName}
                  onChange={(e) => setFloorName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addFloor()}
                />
              </div>
              <Button onClick={addFloor} disabled={busyFloor} className="w-full">
                <Plus className="w-4 h-4 mr-2" /> Add floor
              </Button>
              {floors.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {floors.map((f) => (
                    <Badge key={f.id} variant="secondary">
                      {f.name}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <GridFour className="w-5 h-5 text-foreground" /> 2. Add a table
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {floors.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add a floor first, then tables can be assigned to it.</p>
              ) : (
                <Tabs defaultValue="bulk">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="bulk">Bulk add</TabsTrigger>
                    <TabsTrigger value="single">Single</TabsTrigger>
                  </TabsList>

                  {/* Bulk: generate a run of numbered tables fast. */}
                  <TabsContent value="bulk" className="space-y-3 pt-3">
                    <div className="space-y-1">
                      <Label>Floor</Label>
                      <Select value={bulk.floor_id} onValueChange={(v) => setBulk({ ...bulk, floor_id: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select floor" />
                        </SelectTrigger>
                        <SelectContent>
                          {floors.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="bulk-count">How many</Label>
                        <Input
                          id="bulk-count"
                          type="number"
                          min={1}
                          max={100}
                          value={bulk.count}
                          onChange={(e) => setBulk({ ...bulk, count: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="bulk-cap">Seats each</Label>
                        <Input
                          id="bulk-cap"
                          type="number"
                          min={1}
                          value={bulk.capacity}
                          onChange={(e) => setBulk({ ...bulk, capacity: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="bulk-prefix">Prefix</Label>
                        <Input
                          id="bulk-prefix"
                          placeholder="T"
                          value={bulk.prefix}
                          onChange={(e) => setBulk({ ...bulk, prefix: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="bulk-start">Start at</Label>
                        <Input
                          id="bulk-start"
                          type="number"
                          min={0}
                          value={bulk.start}
                          onChange={(e) => setBulk({ ...bulk, start: e.target.value })}
                        />
                      </div>
                    </div>
                    {bulkPreview && (
                      <p className="text-xs text-muted-foreground">
                        Creates: <span className="font-medium text-foreground">{bulkPreview}</span>
                      </p>
                    )}
                    <Button onClick={addBulk} disabled={busyBulk} className="w-full">
                      <Plus className="w-4 h-4 mr-2" /> {busyBulk ? "Adding…" : "Add tables"}
                    </Button>
                    <p className="text-[11px] text-muted-foreground">You can rename or adjust any table later.</p>
                  </TabsContent>

                  {/* Single: one custom-named table. */}
                  <TabsContent value="single" className="space-y-3 pt-3">
                    <div className="space-y-1">
                      <Label htmlFor="table-name">Table name / number</Label>
                      <Input
                        id="table-name"
                        placeholder="Patio-1"
                        value={table.name}
                        onChange={(e) => setTable({ ...table, name: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && addTable()}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Floor</Label>
                        <Select value={table.floor_id} onValueChange={(v) => setTable({ ...table, floor_id: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select floor" />
                          </SelectTrigger>
                          <SelectContent>
                            {floors.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="table-cap">Seats</Label>
                        <Input
                          id="table-cap"
                          type="number"
                          min={1}
                          value={table.capacity}
                          onChange={(e) => setTable({ ...table, capacity: e.target.value })}
                        />
                      </div>
                    </div>
                    <Button onClick={addTable} disabled={busyTable} className="w-full">
                      <Plus className="w-4 h-4 mr-2" /> Add table
                    </Button>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Current layout */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your layout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {tables.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tables yet. Add floors and tables above to get started.</p>
            ) : (
              floors.map((floor) => {
                const floorTables = tables.filter((t) => t.floor_id === floor.id);
                if (floorTables.length === 0) return null;
                return (
                  <div key={floor.id}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{floor.name}</h3>
                    <div className="flex flex-wrap gap-2">
                      {floorTables.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => openEdit(t)}
                          title="Edit table"
                          className="group border border-border px-3 py-2 bg-card text-sm flex items-center gap-2 hover:border-foreground hover:bg-accent transition-colors"
                        >
                          <span className="font-semibold">{t.name}</span>
                          <span className="text-muted-foreground">· {t.capacity} seats</span>
                          <PencilSimple className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit table dialog */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && !busyEdit && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit table</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="edit-name">Table name / number</Label>
                <Input
                  id="edit-name"
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Floor</Label>
                  <Select value={edit.floor_id} onValueChange={(v) => setEdit({ ...edit, floor_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select floor" />
                    </SelectTrigger>
                    <SelectContent>
                      {floors.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-cap">Seats</Label>
                  <Input
                    id="edit-cap"
                    type="number"
                    min={1}
                    value={edit.capacity}
                    onChange={(e) => setEdit({ ...edit, capacity: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              className="text-danger border-danger/40 hover:bg-danger/10"
              onClick={removeTable}
              disabled={busyEdit}
            >
              <Trash className="w-4 h-4 mr-1" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEdit(null)} disabled={busyEdit}>
                Cancel
              </Button>
              <Button onClick={saveEdit} disabled={busyEdit}>
                {busyEdit ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
