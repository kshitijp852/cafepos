import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import {
  loginUser,
  registerStart,
  registerVerify,
  requestPasswordReset,
} from "@/api/endpoints";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d{10,15}$/;
// Indian GSTIN: state code, PAN, entity digit, 'Z', checksum char.
const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;

// Keep only digits, preserving a single leading "+" (country code).
const sanitizePhone = (v: string): string =>
  (v.trimStart().startsWith("+") ? "+" : "") + v.replace(/\D/g, "");

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  // ---- Login ----
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [forgot, setForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  // ---- Register (two steps: form -> otp) ----
  const [regStep, setRegStep] = useState<"form" | "otp">("form");
  const [regForm, setRegForm] = useState({
    name: "",
    phone: "",
    cafe_name: "",
    gst_number: "",
    test_code: "",
    email: "",
    password: "",
    confirm_password: "",
  });
  // Test/demo signups swap the mandatory GST field for a test access code.
  const [testMode, setTestMode] = useState(false);
  const [otp, setOtp] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);

  const emailInvalid = emailTouched && regForm.email.length > 0 && !EMAIL_RE.test(regForm.email);

  if (user) return <Navigate to="/dashboard" replace />;

  const goDashboard = () => navigate("/dashboard", { replace: true });

  const handleLogin = async () => {
    setBusy(true);
    try {
      login(await loginUser(loginForm));
      goDashboard();
    } catch (err) {
      toast.error(errorMessage(err, "Login failed"));
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async () => {
    if (!EMAIL_RE.test(forgotEmail)) return toast.error("Enter a valid email.");
    setBusy(true);
    try {
      const res = await requestPasswordReset(forgotEmail);
      toast.success(res.message);
      if (res.dev_reset_url) {
        // DEV mode (no SMTP): open the reset page directly.
        console.info("DEV reset URL:", res.dev_reset_url);
        toast.message("Dev mode: reset link in console.");
      }
      setForgot(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not send reset link"));
    } finally {
      setBusy(false);
    }
  };

  const validateReg = (): string | null => {
    if (!regForm.name.trim()) return "Enter your name.";
    if (!PHONE_RE.test(regForm.phone.replace(/[\s\-()]/g, ""))) return "Enter a valid phone number.";
    if (!EMAIL_RE.test(regForm.email)) return "Enter a valid email.";
    if (!regForm.cafe_name.trim()) return "Enter your cafe name.";
    if (testMode) {
      if (!regForm.test_code.trim()) return "Enter the test access code.";
    } else {
      if (!regForm.gst_number.trim()) return "GST number is required.";
      if (!GST_RE.test(regForm.gst_number.trim())) return "Enter a valid 15-character GST number.";
    }
    if (regForm.password.length < 6) return "Password must be at least 6 characters.";
    if (regForm.password !== regForm.confirm_password) return "Passwords do not match.";
    return null;
  };

  const handleRegisterStart = async () => {
    const problem = validateReg();
    if (problem) return toast.error(problem);
    setBusy(true);
    try {
      // Send exactly one of GST / test code, so a stale field can't leak through.
      const res = await registerStart({
        ...regForm,
        gst_number: testMode ? undefined : regForm.gst_number.trim(),
        test_code: testMode ? regForm.test_code.trim() : undefined,
      });
      toast.success(res.message);
      if (res.dev_otp) {
        setOtp(res.dev_otp); // DEV mode: prefill the code.
        toast.message(`Dev mode: code is ${res.dev_otp}`);
      }
      setRegStep("otp");
    } catch (err) {
      toast.error(errorMessage(err, "Could not send verification code"));
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterVerify = async () => {
    if (otp.length !== 6) return toast.error("Enter the 6-digit code.");
    setBusy(true);
    try {
      login(await registerVerify({ email: regForm.email, otp }));
      goDashboard();
    } catch (err) {
      toast.error(errorMessage(err, "Verification failed"));
    } finally {
      setBusy(false);
    }
  };

  const setReg = (k: keyof typeof regForm, v: string) => setRegForm({ ...regForm, [k]: v });

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="font-heading text-3xl font-bold">Café POS</CardTitle>
          <p className="text-sm text-muted-foreground">Manager access</p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            {/* ---------------- Login ---------------- */}
            <TabsContent value="login" className="space-y-3 pt-4">
              {!forgot ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="l-email">Email</Label>
                    <Input
                      id="l-email"
                      type="email"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="l-pass">Password</Label>
                    <Input
                      id="l-pass"
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    />
                  </div>
                  <Button className="w-full" onClick={handleLogin} disabled={busy}>
                    Login
                  </Button>
                  <button
                    type="button"
                    className="w-full text-sm text-foreground hover:underline"
                    onClick={() => {
                      setForgotEmail(loginForm.email);
                      setForgot(true);
                    }}
                  >
                    Forgot password?
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Enter your email and we&apos;ll send a password-reset link.
                  </p>
                  <div className="space-y-1">
                    <Label htmlFor="f-email">Email</Label>
                    <Input
                      id="f-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleForgot()}
                    />
                  </div>
                  <Button className="w-full" onClick={handleForgot} disabled={busy}>
                    Send reset link
                  </Button>
                  <button
                    type="button"
                    className="w-full text-sm text-muted-foreground hover:underline"
                    onClick={() => setForgot(false)}
                  >
                    Back to login
                  </button>
                </>
              )}
            </TabsContent>

            {/* ---------------- Register ---------------- */}
            <TabsContent value="register" className="space-y-3 pt-4">
              {regStep === "form" ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="r-name">Your Name</Label>
                    <Input id="r-name" value={regForm.name} onChange={(e) => setReg("name", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="r-phone">Phone Number</Label>
                    <Input
                      id="r-phone"
                      type="tel"
                      inputMode="numeric"
                      placeholder="+919876543210"
                      value={regForm.phone}
                      onChange={(e) => setReg("phone", sanitizePhone(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="r-cafe">Cafe Name</Label>
                    <Input id="r-cafe" value={regForm.cafe_name} onChange={(e) => setReg("cafe_name", e.target.value)} />
                  </div>
                  {!testMode ? (
                    <div className="space-y-1">
                      <Label htmlFor="r-gst">GST Number</Label>
                      <Input
                        id="r-gst"
                        placeholder="22AAAAA0000A1Z5"
                        maxLength={15}
                        className="uppercase"
                        value={regForm.gst_number}
                        onChange={(e) => setReg("gst_number", e.target.value.toUpperCase().trim())}
                      />
                      <p className="text-xs text-muted-foreground">
                        Required — it appears on every bill you issue.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label htmlFor="r-testcode">Test Access Code</Label>
                      <Input
                        id="r-testcode"
                        value={regForm.test_code}
                        onChange={(e) => setReg("test_code", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Test accounts skip GST. Bills from them are not tax-compliant.
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => setTestMode((v) => !v)}
                  >
                    {testMode ? "I have a GST number" : "Setting up a test account?"}
                  </button>
                  <div className="space-y-1">
                    <Label htmlFor="r-email">Email</Label>
                    <Input
                      id="r-email"
                      type="email"
                      value={regForm.email}
                      onChange={(e) => setReg("email", e.target.value)}
                      onBlur={() => setEmailTouched(true)}
                      aria-invalid={emailInvalid}
                      className={emailInvalid ? "border-danger focus-visible:ring-danger" : ""}
                    />
                    {emailInvalid && <p className="text-xs text-danger">Enter a valid email address.</p>}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="r-pass">Password</Label>
                    <Input
                      id="r-pass"
                      type="password"
                      value={regForm.password}
                      onChange={(e) => setReg("password", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="r-cpass">Confirm Password</Label>
                    <Input
                      id="r-cpass"
                      type="password"
                      value={regForm.confirm_password}
                      onChange={(e) => setReg("confirm_password", e.target.value)}
                    />
                  </div>
                  <Button className="w-full" onClick={handleRegisterStart} disabled={busy}>
                    Send verification code
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Enter the 6-digit code we sent to <b>{regForm.email}</b>.
                  </p>
                  <div className="space-y-1">
                    <Label htmlFor="r-otp">Verification Code</Label>
                    <Input
                      id="r-otp"
                      inputMode="numeric"
                      maxLength={6}
                      className="text-center text-lg tracking-[0.4em]"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => e.key === "Enter" && handleRegisterVerify()}
                    />
                  </div>
                  <Button className="w-full" onClick={handleRegisterVerify} disabled={busy}>
                    Verify &amp; create account
                  </Button>
                  <div className="flex justify-between text-sm">
                    <button
                      type="button"
                      className="text-muted-foreground hover:underline"
                      onClick={() => setRegStep("form")}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="text-foreground hover:underline disabled:opacity-50"
                      onClick={handleRegisterStart}
                      disabled={busy}
                    >
                      Resend code
                    </button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
