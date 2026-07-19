import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowCounterClockwise, ChartBar, DeviceMobile, PencilSimple, Plus, Prohibit, Trash, UserPlus } from "@phosphor-icons/react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import {
  activateWaiterDevice,
  assignDevice,
  createWaiter,
  deactivateWaiter,
  deleteWaiter,
  reactivateWaiter,
  revokeWaiterDevice,
} from "@/api/endpoints";
import { useInvalidate, useWaiterDevices, useWaiters } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DeviceActivation, User } from "@/lib/types";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const UNASSIGNED = "__none__";

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function StaffPage() {
  const { data: waiters = [] } = useWaiters();
  const { data: devices = [] } = useWaiterDevices();
  const invalidate = useInvalidate();
  const navigate = useNavigate();

  const activeStaff = waiters.filter((w) => w.is_active !== false);

  const [form, setForm] = useState({ name: "", username: "" });
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [busy, setBusy] = useState(false);

  const [activateOpen, setActivateOpen] = useState(false);
  const [act, setAct] = useState({ code: "", device_name: "", waiter_id: "" });
  const [activating, setActivating] = useState(false);

  const [renameTarget, setRenameTarget] = useState<DeviceActivation | null>(null);
  const [renameValue, setRenameValue] = useState("");
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

  const activate = async () => {
    if (!act.code.trim()) return toast.error("Enter the device code.");
    setActivating(true);
    try {
      const res = await activateWaiterDevice({
        code: act.code.trim(),
        device_name: act.device_name.trim() || undefined,
        waiter_id: act.waiter_id || undefined,
      });
      setActivateOpen(false);
      setAct({ code: "", device_name: "", waiter_id: "" });
      await invalidate(["waiterDevices"]);
      toast.success(res.message);
    } catch (err) {
      toast.error(errorMessage(err, "Activation failed"));
    } finally {
      setActivating(false);
    }
  };

  const changeAssignment = async (d: DeviceActivation, value: string) => {
    try {
      await assignDevice(d.id, { user_id: value === UNASSIGNED ? null : value });
      await invalidate(["waiterDevices"]);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to assign waiter"));
    }
  };

  const saveRename = async () => {
    if (!renameTarget) return;
    try {
      await assignDevice(renameTarget.id, { device_name: renameValue.trim() });
      setRenameTarget(null);
      await invalidate(["waiterDevices"]);
      toast.success("Device renamed");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to rename device"));
    }
  };

  const revoke = async (id: string) => {
    try {
      await revokeWaiterDevice(id);
      await invalidate(["waiterDevices"]);
      toast.success("Device removed");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to remove device"));
    }
  };

  const toggleActive = async (w: User) => {
    const willDeactivate = w.is_active !== false;
    try {
      await (willDeactivate ? deactivateWaiter(w.id) : reactivateWaiter(w.id));
      await invalidate(["waiters", "waiterDevices"]);
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
      await invalidate(["waiters", "waiterDevices"]);
      toast.success("Staff deleted");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to delete staff"));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">Staff &amp; Devices</h1>
        <p className="text-sm text-muted-foreground">
          Pair ordering devices, then choose who is serving on each. Staff names are optional — a device
          can just take orders.
        </p>
      </div>

      {/* Devices */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Devices</h2>
          <Button size="sm" onClick={() => setActivateOpen(true)}>
            <DeviceMobile size={16} /> Activate a device
          </Button>
        </div>
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Device</TableHead>
                <TableHead>Current waiter</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="px-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="px-4 font-medium">{d.device_name || "Waiter device"}</TableCell>
                  <TableCell>
                    <Select
                      value={d.user_id ?? UNASSIGNED}
                      onValueChange={(v) => changeAssignment(d, v)}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned (ordering only)</SelectItem>
                        {activeStaff.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {d.signed_in ? (
                      <Badge variant="success">Signed in</Badge>
                    ) : (
                      <Badge variant="outline">
                        Logged out{d.last_logout ? ` · ${timeAgo(d.last_logout)}` : ""}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="px-4">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setRenameTarget(d); setRenameValue(d.device_name || ""); }}
                      >
                        <PencilSimple size={16} /> Rename
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:text-danger"
                        onClick={() => revoke(d.id)}
                      >
                        <Trash size={16} /> Remove
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {devices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No devices yet. Open the waiter app on a device to get a code, then activate it here.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

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
                        <div className="font-mono text-xs text-muted-foreground">@{w.username}</div>
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

      {/* Activate device dialog */}
      <Dialog open={activateOpen} onOpenChange={(o) => !o && !activating && setActivateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Activate a device</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            On the device, open the waiter app and tap &quot;Get a device code&quot;. Enter that code here.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="dev-code">Device code</Label>
              <Input
                id="dev-code"
                placeholder="ABFW-68JB-OPZR"
                className="font-mono uppercase tracking-widest"
                value={act.code}
                onChange={(e) => setAct({ ...act, code: e.target.value.toUpperCase() })}
                onKeyDown={(e) => e.key === "Enter" && activate()}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dev-name">Device name (optional)</Label>
              <Input
                id="dev-name"
                placeholder="Counter 1"
                value={act.device_name}
                onChange={(e) => setAct({ ...act, device_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Assign waiter (optional)</Label>
              <Select value={act.waiter_id || UNASSIGNED} onValueChange={(v) => setAct({ ...act, waiter_id: v === UNASSIGNED ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned (ordering only)</SelectItem>
                  {activeStaff.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateOpen(false)} disabled={activating}>
              Cancel
            </Button>
            <Button onClick={activate} disabled={activating}>
              {activating ? "Activating…" : "Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename device dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Rename device</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="rename">Device name</Label>
            <Input
              id="rename"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveRename()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={saveRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Delete {deleteTarget?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Removes <span className="font-mono">@{deleteTarget?.username}</span> from the roster. Any device they
            were on stays paired but becomes unassigned. Past order attribution is kept. To keep the record,
            use Deactivate.
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
