import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { errorMessage } from "@/api/client";
import { confirmPasswordReset } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ password: "", confirm_password: "" });

  const submit = async () => {
    if (form.password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (form.password !== form.confirm_password) return toast.error("Passwords do not match.");
    setBusy(true);
    try {
      const res = await confirmPasswordReset({ token, ...form });
      toast.success(res.message);
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(errorMessage(err, "Reset failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="font-serif text-2xl font-bold">Reset password</CardTitle>
          <p className="text-sm text-muted-foreground">Choose a new password for your account.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!token ? (
            <p className="text-sm text-danger text-center">
              This reset link is invalid or incomplete. Request a new one from the login page.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="rp-pass">New Password</Label>
                <Input
                  id="rp-pass"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rp-cpass">Confirm Password</Label>
                <Input
                  id="rp-cpass"
                  type="password"
                  value={form.confirm_password}
                  onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
              </div>
              <Button className="w-full" onClick={submit} disabled={busy}>
                Update password
              </Button>
            </>
          )}
          <button
            type="button"
            className="w-full text-sm text-muted-foreground hover:underline"
            onClick={() => navigate("/login")}
          >
            Back to login
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
