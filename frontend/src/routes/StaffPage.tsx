import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowCounterClockwise, ChartBar, DeviceMobile, Prohibit, Trash, UserPlus } from "@phosphor-icons/react";
import { toast } from "sonner";

import { errorMessage } from "@/api/client";
import {
  activateWaiterDevice,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { User } from "@/lib/types";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function StaffPage() {
  const { data: waiters = [] } = useWaiters();
  const { data: devices = [] } = useWaiterDevices();
  const invalidate = useInvalidate();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: "", username: "", password: "", confirm: "", code: "" });
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [busy, setBusy] = useState(false);

  const [activateTarget, setActivateTarget] = useState<User | null>(null);
  const [code, setCode] = useState("");
  const [activating, setActivating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const addStaff = async () => {
    if (!form.name.trim()) return toast.error("Enter a name.");
    if (form.password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (form.password !== form.confirm) return toast.error("Passwords do not match.");
    setBusy(true);
    try {
      const created = await createWaiter({
        name: form.name.trim(),
        username: form.username.trim() || undefined,
        password: form.password,
        confirm_password: form.confirm,
      });
      const c = form.code.trim();
      if (c) {
        try {
          await activateWaiterDevice({ waiter_id: created.id, code: c });
          toast.success(`Staff added (${created.username}) and device activated.`);
        } catch (err) {
          toast.error(`Staff added (${created.username}); device activation failed: ${errorMessage(err, "invalid code")}`);
        }
      } else {
        toast.success(`Staff added — username: ${created.username}`);
      }
      setForm({ name: "", username: "", password: "", confirm: "", code: "" });
      setUsernameEdited(false);
      await invalidate(["waiters", "waiterDevices"]);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to add staff"));
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    if (!activateTarget) return;
    if (!code.trim()) return toast.error("Enter the device code.");
    setActivating(true);
    try {
      const res = await activateWaiterDevice({ waiter_id: activateTarget.id, code: code.trim() });
      setActivateTarget(null);
      setCode("");
      await invalidate(["waiterDevices"]);
      toast.success(res.message);
    } catch (err) {
      toast.error(errorMessage(err, "Activation failed"));
    } finally {
      setActivating(false);
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

  const revoke = async (id: string) => {
    try {
      await revokeWaiterDevice(id);
      await invalidate(["waiterDevices"]);
      toast.success("Device unlinked");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to unlink device"));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">Staff</h1>
        <p className="text-sm text-muted-foreground">Create waiter logins and authorize their devices.</p>
      </div>

      {/* Add staff */}
      <section className="border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <UserPlus size={18} />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Add staff login</h2>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({ ...f, name, username: usernameEdited ? f.username : slugify(name) }));
              }}
            />
          </Field>
          <Field label="Username" hint="Waiter signs in with this">
            <Input
              autoCapitalize="none"
              value={form.username}
              onChange={(e) => {
                setUsernameEdited(true);
                set("username", slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Device code (optional)" hint="Paste from the waiter's device to pair now">
            <Input
              placeholder="ABFW-68JB-OPZR"
              className="font-mono uppercase tracking-widest"
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Password">
            <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} />
          </Field>
          <Field label="Confirm password">
            <Input type="password" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} />
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
                <TableHead>Account</TableHead>
                <TableHead>Device</TableHead>
                <TableHead className="px-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waiters.map((w) => {
                const inactive = w.is_active === false;
                const device = devices.find((d) => d.user_id === w.id);
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
                    <TableCell>
                      {device ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">Linked</Badge>
                          <button
                            onClick={() => revoke(device.id)}
                            className="text-xs text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
                          >
                            Unlink
                          </button>
                        </div>
                      ) : (
                        !inactive && (
                          <Button variant="outline" size="sm" onClick={() => { setActivateTarget(w); setCode(""); }}>
                            <DeviceMobile size={15} /> Activate
                          </Button>
                        )
                      )}
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View analytics"
                          aria-label="View analytics"
                          onClick={() => navigate(`/staff/${w.id}`)}
                        >
                          <ChartBar size={17} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={inactive ? "Reactivate" : "Deactivate"}
                          aria-label={inactive ? "Reactivate staff" : "Deactivate staff"}
                          onClick={() => toggleActive(w)}
                        >
                          {inactive ? <ArrowCounterClockwise size={17} /> : <Prohibit size={17} />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-danger"
                          title="Delete"
                          aria-label="Delete staff"
                          onClick={() => setDeleteTarget(w)}
                        >
                          <Trash size={17} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {waiters.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No staff yet. Add a login above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Activate device dialog */}
      <Dialog open={!!activateTarget} onOpenChange={(o) => !o && !activating && setActivateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Activate device for {activateTarget?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {activateTarget?.name} signs in on their device with{" "}
            <span className="font-mono">@{activateTarget?.username}</span> and reads out a code like{" "}
            <span className="font-mono">ABFW-68JB-OPZR</span>. Enter it to authorize that device.
          </p>
          <div className="space-y-1">
            <Label htmlFor="dev-code">Device code</Label>
            <Input
              id="dev-code"
              placeholder="ABFW-68JB-OPZR"
              className="font-mono uppercase tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && activate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateTarget(null)} disabled={activating}>
              Cancel
            </Button>
            <Button onClick={activate} disabled={activating}>
              {activating ? "Activating…" : "Activate"}
            </Button>
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
            Permanently deletes <span className="font-mono">@{deleteTarget?.username}</span> and its device
            authorizations. This can&apos;t be undone. To keep the record but block login, use Deactivate.
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
