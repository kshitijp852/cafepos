import { useState } from "react";
import { Buildings, Lock, UserCircle, WarningCircle } from "@phosphor-icons/react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import { changePassword, lookupPincode, updateCafe, updateProfile } from "@/api/endpoints";
import { useInvalidate, useProfile } from "@/api/queries";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Indian GSTIN: state code, PAN, entity digit, 'Z', checksum char.
const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;

/** Styling for a pincode-derived field: greyed out while empty, lit once filled. */
const derivedField = (value: string) =>
  cn(
    "cursor-default focus-visible:border-input focus-visible:ring-0",
    value
      ? "border-primary/50 bg-accent/40 font-medium text-foreground"
      : "bg-muted/40 text-muted-foreground",
  );

function Section({
  icon,
  title,
  children,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="border border-border">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {icon}
        <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">{children}</div>
      {footer && <div className="flex justify-end border-t border-border px-4 py-3">{footer}</div>}
    </section>
  );
}

export function ProfilePage() {
  const { data: profile } = useProfile();
  const { user, updateUser } = useAuth();
  const invalidate = useInvalidate();

  const isTestAccount = profile?.cafe.is_test_account ?? false;
  const gstRequired = profile?.gst_required ?? false;

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Your account and the business identity printed on every bill.
        </p>
      </div>

      {gstRequired && (
        <div className="flex items-start gap-3 border border-danger bg-danger/10 px-4 py-3 text-sm">
          <WarningCircle size={18} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <p className="font-medium">GST number missing</p>
            <p className="text-muted-foreground">
              A GST number is required for compliant bills. Add it below.
            </p>
          </div>
        </div>
      )}

      <AccountCard
        key={profile?.user.id ?? "account"}
        initial={{ name: profile?.user.name ?? "", phone: profile?.user.phone ?? "" }}
        email={profile?.user.email ?? ""}
        role={profile?.user.role ?? ""}
        onSaved={async (saved) => {
          if (user) updateUser({ ...user, name: saved.name, phone: saved.phone });
          await invalidate(["profile"]);
        }}
      />

      <BusinessCard
        key={profile?.cafe.id ?? "business"}
        initial={{
          name: profile?.cafe.name ?? "",
          phone: profile?.cafe.phone ?? "",
          address: profile?.cafe.address ?? "",
          pincode: profile?.cafe.pincode ?? "",
          city: profile?.cafe.city ?? "",
          state: profile?.cafe.state ?? "",
          gst_number: profile?.cafe.gst_number ?? "",
        }}
        isTestAccount={isTestAccount}
        onSaved={async () => {
          await invalidate(["profile", "cafe"]);
        }}
      />

      <PasswordCard />
    </div>
  );
}

function AccountCard({
  initial,
  email,
  role,
  onSaved,
}: {
  initial: { name: string; phone: string };
  email: string;
  role: string;
  onSaved: (saved: { name: string; phone: string }) => void | Promise<void>;
}) {
  // Seeded once; the parent's `key` remounts this when the profile query resolves.
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required.");
    setBusy(true);
    try {
      const saved = await updateProfile({ name: form.name.trim(), phone: form.phone.trim() });
      await onSaved({ name: saved.name, phone: saved.phone ?? "" });
      toast.success("Profile saved");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to save profile"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      icon={<UserCircle size={18} />}
      title="Account"
      footer={
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save account"}
        </Button>
      }
    >
      <div className="space-y-1">
        <Label>Your name</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Phone</Label>
        <Input
          type="tel"
          inputMode="tel"
          placeholder="+91 98765 43210"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Email</Label>
        <Input value={email} disabled />
        <p className="text-xs text-muted-foreground">Email is your login and cannot be changed.</p>
      </div>
      <div className="space-y-1">
        <Label>Role</Label>
        <Input value={role} disabled className="capitalize" />
      </div>
    </Section>
  );
}

function BusinessCard({
  initial,
  isTestAccount,
  onSaved,
}: {
  initial: {
    name: string;
    phone: string;
    address: string;
    pincode: string;
    city: string;
    state: string;
    gst_number: string;
  };
  isTestAccount: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // City + state are lookup-only, so an incomplete pincode clears them rather
  // than leaving a stale city attached to a different area.
  const onPincode = async (raw: string) => {
    const pin = raw.replace(/\D/g, "").slice(0, 6);
    if (pin.length !== 6) {
      setForm((f) => ({ ...f, pincode: pin, city: "", state: "" }));
      return;
    }
    set("pincode", pin);
    setLookingUp(true);
    try {
      const hit = await lookupPincode(pin);
      setForm((f) => ({ ...f, pincode: pin, city: hit.city, state: hit.state }));
    } catch (err) {
      // Nothing resolved — don't leave a previous pincode's city/state behind.
      setForm((f) => ({ ...f, city: "", state: "" }));
      toast.error(errorMessage(err, "Could not look up that pincode"));
    } finally {
      setLookingUp(false);
    }
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Restaurant name is required.");
    if (form.pincode && form.pincode.length !== 6) return toast.error("Enter a 6-digit pincode.");
    const gst = form.gst_number.trim();
    // Test accounts may run without GST; everyone else must have a valid one.
    if (!isTestAccount && !gst) return toast.error("GST number is required.");
    if (gst && !GST_RE.test(gst)) return toast.error("Enter a valid 15-character GST number.");

    setBusy(true);
    try {
      await updateCafe({
        name: form.name.trim(),
        phone: form.phone,
        address: form.address,
        pincode: form.pincode,
        city: form.city,
        state: form.state,
        gst_number: gst,
      });
      await onSaved();
      toast.success("Business details saved");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to save business details"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      icon={<Buildings size={18} />}
      title="Business"
      footer={
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save business"}
        </Button>
      }
    >
      <div className="space-y-1 sm:col-span-2">
        <Label>Restaurant name</Label>
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Primary phone</Label>
        <Input
          type="tel"
          inputMode="tel"
          placeholder="+91 98765 43210"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>GST number {!isTestAccount && <span className="text-danger">*</span>}</Label>
        <Input
          placeholder="22AAAAA0000A1Z5"
          maxLength={15}
          className="uppercase"
          value={form.gst_number}
          onChange={(e) => set("gst_number", e.target.value.toUpperCase().trim())}
        />
        {isTestAccount && (
          <p className="text-xs text-muted-foreground">
            Test account — GST optional, bills are not tax-compliant.
          </p>
        )}
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label>Address</Label>
        <Input
          placeholder="Street, area, landmark"
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Pincode</Label>
        <Input
          inputMode="numeric"
          maxLength={6}
          placeholder="560001"
          value={form.pincode}
          onChange={(e) => onPincode(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {lookingUp ? "Looking up…" : "City and state fill in automatically."}
        </p>
      </div>
      {/* Derived from the pincode: dimmed until the lookup resolves, then lit. */}
      <div className="space-y-1">
        <Label>City</Label>
        <Input placeholder="Bangalore" value={form.city} readOnly className={derivedField(form.city)} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label>State</Label>
        <Input placeholder="Karnataka" value={form.state} readOnly className={derivedField(form.state)} />
      </div>
    </Section>
  );
}

function PasswordCard() {
  const [form, setForm] = useState({ current_password: "", password: "", confirm_password: "" });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (form.password.length < 6) return toast.error("New password must be at least 6 characters.");
    if (form.password !== form.confirm_password) return toast.error("Passwords do not match.");
    setBusy(true);
    try {
      await changePassword(form);
      setForm({ current_password: "", password: "", confirm_password: "" });
      toast.success("Password updated");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to change password"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      icon={<Lock size={18} />}
      title="Password"
      footer={
        <Button onClick={save} disabled={busy}>
          {busy ? "Updating…" : "Change password"}
        </Button>
      }
    >
      <div className="space-y-1 sm:col-span-2">
        <Label>Current password</Label>
        <Input
          type="password"
          value={form.current_password}
          onChange={(e) => setForm({ ...form, current_password: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>New password</Label>
        <Input
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Confirm new password</Label>
        <Input
          type="password"
          value={form.confirm_password}
          onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
        />
      </div>
    </Section>
  );
}
