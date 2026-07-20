import { useSyncExternalStore } from "react";

import type { Bill, Cafe } from "@/lib/types";
import { buildReceipt } from "@/lib/escpos";

// Direct-to-printer receipt printing over Web Bluetooth or WebUSB. This runs
// entirely on the device, so receipts print during an internet outage — the
// tablet talks to the thermal printer with no server involved.
//
// Both Web APIs require a user gesture to pair and a secure context (HTTPS or
// localhost). WebUSB remembers granted devices across reloads (getDevices);
// Web Bluetooth reconnect support varies, so re-pairing may be needed there.

type Transport = {
  kind: "bluetooth" | "usb";
  name: string;
  write: (bytes: Uint8Array) => Promise<void>;
  disconnect: () => void;
};

const HINT_KEY = "pos_printer"; // localStorage: { kind, name } for display/hint

let active: Transport | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setActive(t: Transport | null) {
  active = t;
  try {
    if (t) localStorage.setItem(HINT_KEY, JSON.stringify({ kind: t.kind, name: t.name }));
  } catch {
    /* ignore */
  }
  refreshSnapshot();
  emit();
}

export interface PrinterStatus {
  connected: boolean;
  kind: "bluetooth" | "usb" | null;
  name: string | null;
}

let snapshot: PrinterStatus = { connected: false, kind: null, name: null };

function computeSnapshot(): PrinterStatus {
  return active
    ? { connected: true, kind: active.kind, name: active.name }
    : { connected: false, kind: null, name: null };
}

function refreshSnapshot() {
  snapshot = computeSnapshot();
}

export function usePrinter(): PrinterStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
}

export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function isUsbSupported(): boolean {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

// ---- Bluetooth ------------------------------------------------------------

// Service UUIDs commonly exposed by generic ESC/POS BLE printers. Needed in
// optionalServices so we're allowed to access them after acceptAllDevices.
const BLE_SERVICES: BluetoothServiceUUID[] = [
  0x18f0,
  0xff00,
  0xffe0,
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
];

async function findWritableCharacteristic(
  server: BluetoothRemoteGATTServer,
): Promise<BluetoothRemoteGATTCharacteristic> {
  const services = await server.getPrimaryServices();
  for (const service of services) {
    const chars = await service.getCharacteristics();
    for (const c of chars) {
      if (c.properties.write || c.properties.writeWithoutResponse) return c;
    }
  }
  throw new Error("No writable characteristic found on this printer.");
}

async function connectBluetoothDevice(device: BluetoothDevice): Promise<Transport> {
  const server = await device.gatt!.connect();
  const characteristic = await findWritableCharacteristic(server);
  const preferNoResponse = characteristic.properties.writeWithoutResponse;
  const CHUNK = 180; // BLE MTU is small; stream in slices

  return {
    kind: "bluetooth",
    name: device.name || "Bluetooth printer",
    write: async (bytes) => {
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const slice = bytes.slice(i, i + CHUNK);
        if (preferNoResponse) await characteristic.writeValueWithoutResponse(slice);
        else await characteristic.writeValueWithResponse(slice);
      }
    },
    disconnect: () => device.gatt?.disconnect(),
  };
}

export async function pairBluetooth(): Promise<void> {
  if (!isBluetoothSupported()) throw new Error("Web Bluetooth is not supported on this device/browser.");
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: BLE_SERVICES,
  });
  setActive(await connectBluetoothDevice(device));
}

// ---- USB ------------------------------------------------------------------

async function connectUsbDevice(device: USBDevice): Promise<Transport> {
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);

  // Find an interface exposing a bulk OUT endpoint (the print stream).
  let interfaceNumber = -1;
  let endpointNumber = -1;
  for (const iface of device.configuration!.interfaces) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find((ep) => ep.direction === "out" && ep.type === "bulk");
      if (out) {
        interfaceNumber = iface.interfaceNumber;
        endpointNumber = out.endpointNumber;
        break;
      }
    }
    if (interfaceNumber >= 0) break;
  }
  if (interfaceNumber < 0) throw new Error("No USB printer endpoint found.");
  await device.claimInterface(interfaceNumber);

  const CHUNK = 4096;
  const name = [device.manufacturerName, device.productName].filter(Boolean).join(" ") || "USB printer";
  return {
    kind: "usb",
    name,
    write: async (bytes) => {
      for (let i = 0; i < bytes.length; i += CHUNK) {
        await device.transferOut(endpointNumber, bytes.slice(i, i + CHUNK));
      }
    },
    disconnect: () => void device.close().catch(() => undefined),
  };
}

export async function pairUsb(): Promise<void> {
  if (!isUsbSupported()) throw new Error("WebUSB is not supported on this device/browser.");
  // Printer class (7) plus vendor-specific (255), which many ESC/POS units use.
  const device = await navigator.usb.requestDevice({
    filters: [{ classCode: 7 }, { classCode: 0xff }],
  });
  setActive(await connectUsbDevice(device));
}

// ---- Reconnect / print ----------------------------------------------------

// Best-effort silent reconnect to a previously granted USB printer (WebUSB
// remembers permissions). No user gesture needed.
async function reconnectUsb(): Promise<boolean> {
  if (!isUsbSupported()) return false;
  try {
    const devices = await navigator.usb.getDevices();
    if (devices.length === 0) return false;
    setActive(await connectUsbDevice(devices[0]));
    return true;
  } catch {
    return false;
  }
}

/** Print a receipt for a bill. Reconnects to a remembered USB printer if idle. */
export async function printReceipt(bill: Bill, cafe?: Cafe | null): Promise<void> {
  if (!active) await reconnectUsb();
  if (!active) throw new Error("No printer connected. Pair one in Settings.");
  await active.write(buildReceipt(bill, cafe));
}

/** Print a short confirmation slip to verify the connection. */
export async function printTest(): Promise<void> {
  if (!active) await reconnectUsb();
  if (!active) throw new Error("No printer connected. Pair one in Settings.");
  const enc = new TextEncoder();
  const body = enc.encode("\n  Cafe POS\n  Printer connected OK\n\n\n");
  await active.write(new Uint8Array([0x1b, 0x40, ...body, 0x1d, 0x56, 0x00]));
}

export function disconnectPrinter(): void {
  active?.disconnect();
  setActive(null);
  try {
    localStorage.removeItem(HINT_KEY);
  } catch {
    /* ignore */
  }
}

/** True if the last pairing hint exists (for showing "reconnect" affordances). */
export function hasPrinterHint(): boolean {
  try {
    return !!localStorage.getItem(HINT_KEY);
  } catch {
    return false;
  }
}
