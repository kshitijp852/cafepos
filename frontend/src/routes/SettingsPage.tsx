import { useEffect, useState } from "react";
import { Printer, QrCode } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { toast } from "@/components/ui/sonner";

import { errorMessage, getBackendUrl } from "@/api/client";
import { updatePaymentSettings } from "@/api/endpoints";
import { useInvalidate, usePaymentSettings } from "@/api/queries";
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
  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Device setup for this browser.</p>
      </div>

      <ReceiptPrinterCard />

      <UpiAutoSettleCard />

      <p className="text-xs text-muted-foreground">
        Restaurant name, address, and GST live on the{" "}
        <Link to="/profile" className="underline">
          Profile
        </Link>{" "}
        page. Tax rates and packing/delivery charges are on the Menu page under “Charges &amp; taxes”.
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

// UPI auto-settle: a dynamic QR per bill, and gateway payment webhooks that
// close the table on their own. Only the mock gateway exists so far.
function UpiAutoSettleCard() {
  const { data: settings } = usePaymentSettings();
  const invalidate = useInvalidate();
  const [form, setForm] = useState({ merchant_id: "", vpa: "", payee_name: "", webhook_secret: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({ merchant_id: settings.merchant_id, vpa: settings.vpa, payee_name: settings.payee_name, webhook_secret: "" });
    }
  }, [settings]);

  const save = async (enabled: boolean) => {
    setBusy(true);
    try {
      await updatePaymentSettings({
        enabled,
        provider: settings?.provider ?? "mock",
        merchant_id: form.merchant_id,
        vpa: form.vpa,
        payee_name: form.payee_name,
        webhook_secret: form.webhook_secret || undefined,
      });
      await invalidate(["payments"]);
      toast.success(enabled ? "UPI auto-settle is on" : "UPI auto-settle saved (off)");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save UPI settings"));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof form, label: string, placeholder: string, type = "text") => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <section className="border border-border">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <QrCode size={18} />
        <h2 className="text-sm font-semibold uppercase tracking-wide">UPI auto-settle</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {settings?.enabled ? "On" : "Off"} · {settings?.provider ?? "mock"} gateway
        </span>
      </div>
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          Settling with UPI shows a QR for the exact bill. When the gateway confirms the payment, the table closes
          on its own. Payments to your counter QR are matched by amount, and you're asked to pick the table when
          more than one could match.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("vpa", "UPI ID", "cafe@ybl")}
          {field("payee_name", "Payee name", "Your cafe name")}
          {field("merchant_id", "Merchant ID", "From the gateway dashboard")}
          {field(
            "webhook_secret",
            "Webhook secret",
            settings?.webhook_secret_set ? "Saved (enter to replace)" : "From the gateway dashboard",
            "password",
          )}
        </div>
        {settings && (
          <div className="space-y-1 text-xs">
            <p className="text-muted-foreground">Webhook URL to register with the gateway:</p>
            <code className="block break-all border border-border bg-muted/40 px-2 py-1.5">
              {(getBackendUrl() || window.location.origin) + settings.webhook_path}
            </code>
          </div>
        )}
        {settings?.provider === "mock" && (
          <p className="text-xs text-muted-foreground">
            The mock gateway is for trying the flow: the QR dialog has a “Simulate payment” button. Real PhonePe or
            Paytm payments need that gateway's integration added first.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => save(true)}>
            {settings?.enabled ? "Save" : "Save & turn on"}
          </Button>
          {settings?.enabled && (
            <Button variant="outline" disabled={busy} onClick={() => save(false)}>
              Turn off
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
