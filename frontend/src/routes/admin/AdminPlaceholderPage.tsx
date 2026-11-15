import { useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Temporary landing for platform_admin until the real cafe-approval
// dashboard (list + approve/reject) lands in a later slice.
export function AdminPlaceholderPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="font-heading text-2xl font-bold">Platform Admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Signed in as <b>{user?.name}</b>. The cafe-approval dashboard is coming in a later slice.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          >
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
