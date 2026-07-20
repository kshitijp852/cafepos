import { useState } from "react";
import { Printer } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { toast } from "@/components/ui/sonner";

import { Button } from "@/components/ui/button";
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
