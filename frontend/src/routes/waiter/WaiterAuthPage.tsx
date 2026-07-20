import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowsClockwise, DeviceMobile, WarningCircle } from "@phosphor-icons/react";

import { errorMessage } from "@/api/client";
import { pollDeviceCode, requestDeviceCode, type DevicePollResult } from "@/api/endpoints";
import type { User } from "@/lib/types";
import { useAuth } from "@/auth/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DEVICE_KEY = "waiter_device_id";

function ensureDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `waiter_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function WaiterAuthPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [deviceId] = useState(ensureDeviceId);

  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const finish = useCallback(
    (res: Extract<DevicePollResult, { status: "active" }>) => {
      stopPolling();
      // Device session: the "user" is a light placeholder; the live assigned
      // waiter is read from GET /devices/me in the app.
      const u = res.device.assigned_user;
      const placeholder = {
        id: u?.id ?? res.device.device_id,
        name: u?.name ?? res.device.device_name ?? "Waiter device",
        role: "staff",
      } as User;
      login({ user: placeholder, token: res.token, refresh_token: res.refresh_token });
      navigate("/waiter/tables", { replace: true });
    },
    [login, navigate],
  );

  const getCode = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const res = await requestDeviceCode(deviceId);
      setCode(res.code);
      setExpiresAt(new Date(res.expires_at).getTime());
    } catch (err) {
      setError(errorMessage(err, "Could not get a code"));
    } finally {
      setBusy(false);
    }
  }, [deviceId]);

  // Codes expire server-side (DEVICE_CODE_EXPIRY_MINUTES). Count down so nobody
  // reads a dead code aloud, and clear it at zero so the only thing on screen is
  // the button that gets a fresh one.
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        setCode("");
        setExpiresAt(null);
        setError("That code expired. Get a new one.");
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // Poll until a manager activates this device.
  useEffect(() => {
    if (!code) return;
    const tick = async () => {
      try {
        const res = await pollDeviceCode({ device_id: deviceId, code });
        if (res.status === "active") finish(res);
      } catch {
        /* keep polling */
      }
    };
    pollRef.current = setInterval(tick, 3000);
    return stopPolling;
  }, [code, deviceId, finish]);

  if (user && user.role === "staff") return <Navigate to="/waiter/tables" replace />;

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <DeviceMobile size={36} className="mx-auto mb-2" />
          <CardTitle className="font-heading text-2xl font-bold">Waiter Device</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Show this code to your manager. They&apos;ll activate this device from the manager panel.
          </p>
          {error && (
            <Alert variant="destructive">
              <WarningCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {code ? (
            <>
              <div className="select-all border border-border bg-secondary py-4 text-center font-mono text-3xl font-bold tracking-[0.2em]">
                {code}
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <ArrowsClockwise className="w-4 h-4 animate-spin" />
                <span>Waiting for your manager to activate…</span>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Unlocks automatically once activated · expires in {formatCountdown(secondsLeft)}
              </p>
              <Button variant="ghost" className="w-full" onClick={getCode} disabled={busy}>
                {busy ? "Getting a code…" : "Get a new code"}
              </Button>
            </>
          ) : (
            <Button className="h-12 w-full" onClick={getCode} disabled={busy}>
              {busy ? "Getting a code…" : "Get a device code"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
