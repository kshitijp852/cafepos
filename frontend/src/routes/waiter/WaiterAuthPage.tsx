import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { WarningCircle, ArrowsClockwise, DeviceMobile } from "@phosphor-icons/react";

import { errorMessage } from "@/api/client";
import { pollDeviceCode, requestDeviceCode, waiterLogin } from "@/api/endpoints";
import type { AuthResponse } from "@/lib/types";
import { useAuth } from "@/auth/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DEVICE_KEY = "waiter_device_id";

function ensureDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `waiter_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function WaiterAuthPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [deviceId] = useState(ensureDeviceId);

  // Sign-in (credentialed) flow.
  const [form, setForm] = useState({ username: "", password: "" });
  const [signinCode, setSigninCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Credential-less device-code flow.
  const [deviceCode, setDeviceCode] = useState("");
  const [codeError, setCodeError] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const finish = useCallback(
    (auth: AuthResponse) => {
      stopPolling();
      login(auth);
      navigate("/waiter/tables", { replace: true });
    },
    [login, navigate],
  );

  // ---- Sign-in flow ----
  const signIn = async (silent = false) => {
    if (!silent) setBusy(true);
    setError("");
    try {
      const res = await waiterLogin({ ...form, device_id: deviceId });
      if (res.status === "active") finish(res);
      else setSigninCode(res.code);
    } catch (err) {
      if (!silent) setError(errorMessage(err, "Login failed"));
    } finally {
      if (!silent) setBusy(false);
    }
  };

  // Poll the login endpoint while a sign-in pairing code is showing.
  useEffect(() => {
    if (!signinCode) return;
    pollRef.current = setInterval(() => signIn(true), 3000);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signinCode]);

  // ---- Credential-less device-code flow ----
  const getCode = useCallback(async () => {
    setCodeError("");
    try {
      const res = await requestDeviceCode(deviceId);
      setDeviceCode(res.code);
    } catch (err) {
      setCodeError(errorMessage(err, "Could not get a code"));
    }
  }, [deviceId]);

  // Poll the device-code endpoint until a manager activates it.
  useEffect(() => {
    if (!deviceCode) return;
    const tick = async () => {
      try {
        const res = await pollDeviceCode({ device_id: deviceId, code: deviceCode });
        if (res.status === "active") finish(res);
      } catch {
        /* keep polling */
      }
    };
    pollRef.current = setInterval(tick, 3000);
    return stopPolling;
  }, [deviceCode, deviceId, finish]);

  const onTabChange = (v: string) => {
    stopPolling();
    setError("");
    setCodeError("");
    if (v === "code") {
      setSigninCode("");
      if (!deviceCode) getCode();
    } else {
      setDeviceCode("");
    }
  };

  if (user && user.role === "staff") return <Navigate to="/waiter/tables" replace />;

  const CodeBlock = ({ code }: { code: string }) => (
    <>
      <div className="select-all border border-border bg-secondary py-4 text-center font-mono text-3xl font-bold tracking-[0.2em]">
        {code}
      </div>
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <ArrowsClockwise className="w-4 h-4 animate-spin" />
        <span>Waiting for your manager to activate…</span>
      </div>
      <p className="text-xs text-muted-foreground text-center">This unlocks automatically once activated.</p>
    </>
  );

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <DeviceMobile size={36} className="mx-auto mb-2" />
          <CardTitle className="font-serif text-2xl font-bold">Waiter Device</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" onValueChange={onTabChange}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="code">Device code</TabsTrigger>
            </TabsList>

            {/* Credentialed sign-in */}
            <TabsContent value="signin" className="space-y-4 pt-4">
              {!signinCode ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="w-user">Username</Label>
                    <Input
                      id="w-user"
                      autoCapitalize="none"
                      autoCorrect="off"
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value.trim() })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="w-pass">Password</Label>
                    <Input
                      id="w-pass"
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && signIn()}
                    />
                  </div>
                  {error && (
                    <Alert variant="destructive">
                      <WarningCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button
                    className="w-full"
                    onClick={() => signIn()}
                    disabled={busy || !form.username || !form.password}
                  >
                    Sign in
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground text-center">Give this code to your manager:</p>
                  <CodeBlock code={signinCode} />
                  <Button variant="outline" className="w-full" onClick={() => { stopPolling(); setSigninCode(""); }}>
                    Back
                  </Button>
                </>
              )}
            </TabsContent>

            {/* Credential-less device code */}
            <TabsContent value="code" className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground text-center">
                Show this code to your manager. They&apos;ll pick your name and activate this device.
              </p>
              {codeError && (
                <Alert variant="destructive">
                  <WarningCircle className="h-4 w-4" />
                  <AlertDescription>{codeError}</AlertDescription>
                </Alert>
              )}
              {deviceCode ? (
                <CodeBlock code={deviceCode} />
              ) : (
                <Button className="w-full" onClick={getCode}>
                  Get a device code
                </Button>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
