import { useEffect, useState } from "react";
import { Printer, Storefront } from "@phosphor-icons/react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import { updateCafe } from "@/api/endpoints";
import { useCafe, useInvalidate } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  disconnectPrinter,
  isBluetoothSupported,
  isUsbSupported,
  pairBluetooth,
  pairUsb,
  printTest,
  usePrinter,
} from "@/lib/printer";

export function SettingsPage() {
  const { data: cafe } = useCafe();
  const invalidate = useInvalidate();
  const [form, setForm] = useState({ name: "", phone: "", address: "", gst_number: "" });
  const [busy, setBusy] = useState(false);

  // Seed the form once the cafe loads.
  useEffect(() => {
    if (cafe) {
      setForm({
        name: cafe.name ?? "",
        phone: cafe.phone ?? "",
        address: cafe.address ?? "",
        gst_number: cafe.gst_number ?? "",
      });
    }
  }, [cafe]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return toast.error("Restaurant name is required.");
    setBusy(true);
    try {
      await updateCafe({
        name: form.name.trim(),
        phone: form.phone,
        address: form.address,
        gst_number: form.gst_number,
      });
      await invalidate(["cafe"]);
      toast.success("Restaurant details saved");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to save settings"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">Restaurant settings</h1>
        <p className="text-sm text-muted-foreground">
          Name, contact, address, and GST — shown on the app and on printed bills.
        </p>
      </div>

      <section className="border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Storefront size={18} />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Details</h2>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
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
            <Label>GST number</Label>
            <Input
              placeholder="22AAAAA0000A1Z5"
              className="uppercase"
              value={form.gst_number}
              onChange={(e) => set("gst_number", e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Address</Label>
            <Input
              placeholder="Street, area, city, PIN"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end border-t border-border px-4 py-3">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save details"}
          </Button>
        </div>
      </section>

      <ReceiptPrinterCard />

      <p className="text-xs text-muted-foreground">
        Tax rates and packing/delivery charges are managed on the Menu page under “Charges &amp; taxes”.
      </p>
    </div>
  );
}

// Pair a thermal receipt printer over Bluetooth or USB. Printing runs on the
// device, so receipts print even with no internet.
function ReceiptPrinterCard() {
  const printer = usePrinter();
  const [busy, setBusy] = useState<string | null>(null);
  const btOk = isBluetoothSupported();
  const usbOk = isUsbSupported();

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      // Ignore the user cancelling the browser's device picker.
      if ((err as DOMException)?.name !== "NotFoundError") {
        toast.error(err instanceof Error ? err.message : "Printer error");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="border border-border">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Printer size={18} />
        <h2 className="text-sm font-semibold uppercase tracking-wide">Receipt printer</h2>
      </div>
      <div className="space-y-4 p-4">
        <div className="text-sm">
          {printer.connected ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Connected · <span className="font-medium">{printer.name}</span> ({printer.kind})
            </span>
          ) : (
            <span className="text-muted-foreground">No printer connected.</span>
          )}
        </div>

        {!btOk && !usbOk && (
          <p className="text-xs text-muted-foreground">
            This browser supports neither Web Bluetooth nor WebUSB. Use Chrome/Edge on Android or desktop, over
            HTTPS.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {btOk && (
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => run("bt", pairBluetooth, "Bluetooth printer paired")}
            >
              {busy === "bt" ? "Pairing…" : "Pair Bluetooth"}
            </Button>
          )}
          {usbOk && (
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => run("usb", pairUsb, "USB printer connected")}
            >
              {busy === "usb" ? "Connecting…" : "Connect USB"}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={busy !== null || !printer.connected}
            onClick={() => run("test", printTest, "Test slip sent")}
          >
            Test print
          </Button>
          {printer.connected && (
            <Button variant="ghost" disabled={busy !== null} onClick={disconnectPrinter}>
              Disconnect
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Pairing needs a tap (browser security). Once paired, bills print here directly — including during an
          internet outage.
        </p>
      </div>
    </section>
  );
}
