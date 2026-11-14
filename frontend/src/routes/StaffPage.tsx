import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowCounterClockwise, ChartBar, Prohibit, Trash, UserPlus } from "@phosphor-icons/react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import { createWaiter, deactivateWaiter, deleteWaiter, reactivateWaiter } from "@/api/endpoints";
import { useInvalidate, useWaiters } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { User } from "@/lib/types";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function StaffPage() {
  const { data: waiters = [] } = useWaiters();
  const invalidate = useInvalidate();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: "", username: "" });
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [busy, setBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const addStaff = async () => {
    if (!form.name.trim()) return toast.error("Enter a name.");
    setBusy(true);
    try {
      const created = await createWaiter({
        name: form.name.trim(),
        username: form.username.trim() || undefined,
      });
      toast.success(`Staff added — ${created.name}`);
      setForm({ name: "", username: "" });
      setUsernameEdited(false);
      await invalidate(["waiters"]);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to add staff"));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (w: User) => {
    const willDeactivate = w.is_active !== false;
    try {
      await (willDeactivate ? deactivateWaiter(w.id) : reactivateWaiter(w.id));
      await invalidate(["waiters"]);
      toast.success(willDeactivate ? "Staff deactivated" : "Staff reactivated");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to update staff"));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteWaiter(deleteTarget.id);
      setDeleteTarget(null);
      await invalidate(["waiters"]);
      toast.success("Staff deleted");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to delete staff"));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Staff</h1>
        <p className="text-sm text-muted-foreground">
          Add the people who work here. Staff names are optional — a counter order can go in unattributed.
        </p>
      </div>

      {/* Add staff */}
      <section className="border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <UserPlus size={18} />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Add staff member</h2>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({ ...f, name, username: usernameEdited ? f.username : slugify(name) }));
              }}
              onKeyDown={(e) => e.key === "Enter" && addStaff()}
            />
          </Field>
          <Field label="Username" hint="Handle used in reports">
            <Input
              autoCapitalize="none"
              value={form.username}
              onChange={(e) => {
                setUsernameEdited(true);
                set("username", slugify(e.target.value));
              }}
            />
          </Field>
          <div className="flex items-end">
            <Button onClick={addStaff} disabled={busy} className="w-full">
              <UserPlus size={16} /> Add staff
            </Button>
          </div>
        </div>
      </section>

      {/* Staff table */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Staff members</h2>
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Staff</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="px-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waiters.map((w) => {
                const inactive = w.is_active === false;
                return (
                  <TableRow key={w.id}>
                    <TableCell className="px-4">
                      <button
                        onClick={() => navigate(`/staff/${w.id}`)}
                        className={`text-left transition-opacity hover:opacity-70 ${inactive ? "opacity-50" : ""}`}
                      >
                        <div className="font-medium underline-offset-2 hover:underline">{w.name}</div>
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={inactive ? "outline" : "success"}>{inactive ? "Inactive" : "Active"}</Badge>
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/staff/${w.id}`)}>
                          <ChartBar size={16} /> Analytics
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(w)}>
                          {inactive ? <ArrowCounterClockwise size={16} /> : <Prohibit size={16} />}
                          {inactive ? "Reactivate" : "Deactivate"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:text-danger"
                          onClick={() => setDeleteTarget(w)}
                        >
                          <Trash size={16} /> Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {waiters.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    No staff yet. Add names above if you want per-waiter tracking.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Delete {deleteTarget?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Removes {deleteTarget?.name} from the roster. Past order attribution is kept. To keep the
            record, use Deactivate.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
