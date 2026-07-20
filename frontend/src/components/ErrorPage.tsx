import { useState } from "react";
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";
import { ArrowClockwise, House, Trash, WarningOctagon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { clearPersistedCache } from "@/lib/cache";

/** Human-readable summary of whatever react-router handed us. */
function describe(error: unknown): { title: string; detail: string } {
  if (isRouteErrorResponse(error)) {
    return {
      title: error.status === 404 ? "Page not found" : `Request failed (${error.status})`,
      detail: error.statusText || String(error.data ?? ""),
    };
  }
  if (error instanceof Error) return { title: "Something went wrong", detail: error.message };
  return { title: "Something went wrong", detail: String(error ?? "Unknown error") };
}

/**
 * Route-level error screen. The common cause in this app is a locally cached
 * response that predates a backend change, so clearing that cache is offered
 * as a first-class action rather than left to devtools.
 */
export function ErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const [showDetail, setShowDetail] = useState(false);
  const [clearing, setClearing] = useState(false);
  const { title, detail } = describe(error);

  const resetCache = async () => {
    setClearing(true);
    await clearPersistedCache();
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="w-full max-w-md border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <WarningOctagon size={22} className="text-danger" />
          <h1 className="font-heading text-lg font-bold">{title}</h1>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-sm text-muted-foreground">
            This screen failed to load. Your bills and orders are safe — nothing was lost.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => window.location.reload()}>
              <ArrowClockwise size={16} className="mr-2" />
              Reload
            </Button>
            <Button variant="outline" onClick={() => navigate("/dashboard")}>
              <House size={16} className="mr-2" />
              Back to floor
            </Button>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Still broken after a reload? Clear this device&apos;s offline copy of the data and fetch it
              fresh. Queued offline orders are not affected.
            </p>
            <Button variant="ghost" className="mt-2 px-0" disabled={clearing} onClick={resetCache}>
              <Trash size={16} className="mr-2" />
              {clearing ? "Clearing…" : "Clear cached data & reload"}
            </Button>
          </div>

          {detail && (
            <div className="border-t border-border pt-3">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => setShowDetail((v) => !v)}
              >
                {showDetail ? "Hide" : "Show"} technical details
              </button>
              {showDetail && (
                <pre className="mt-2 max-h-40 overflow-auto bg-muted p-3 text-xs text-muted-foreground">
                  {detail}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
