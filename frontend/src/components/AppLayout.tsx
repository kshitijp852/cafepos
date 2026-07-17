import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { CaretDown, DeviceMobile, List, SignOut } from "@phosphor-icons/react";

import { useAuth } from "@/auth/AuthContext";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertsBell } from "@/components/AlertsBell";
import { SidebarNav, Wordmark } from "@/components/Sidebar";

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function AccountMenu({
  user,
  onWaiterMode,
  onLogout,
}: {
  user: User | null;
  onWaiterMode: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 border border-border px-2 py-1.5 transition-colors hover:bg-accent"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center bg-primary text-xs font-semibold text-primary-foreground">
          {initials(user?.name)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium">{user?.name}</span>
          <span className="block text-[0.7rem] capitalize text-muted-foreground">{user?.role}</span>
        </span>
        <CaretDown size={14} className="hidden text-muted-foreground sm:block" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-52 border border-border bg-card shadow-2xl shadow-foreground/10"
        >
          <div className="border-b border-border px-4 py-3 sm:hidden">
            <div className="text-sm font-medium">{user?.name}</div>
            <div className="text-xs capitalize text-muted-foreground">{user?.role}</div>
          </div>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onWaiterMode();
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent"
          >
            <DeviceMobile size={18} />
            Waiter Mode
          </button>
          <div className="border-t border-border" />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-danger transition-colors hover:bg-danger hover:text-danger-foreground"
          >
            <SignOut size={18} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Wordmark />
        </div>
        <SidebarNav />
      </aside>

      {/* Mobile drawer */}
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent className="left-0 top-0 h-full max-w-[16rem] translate-x-0 translate-y-0 border-r border-border p-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-[16rem]">
          <div className="flex h-16 items-center border-b border-border px-5">
            <Wordmark />
          </div>
          <SidebarNav onNavigate={() => setDrawerOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
            >
              <List size={22} />
            </Button>
            <div className="lg:hidden">
              <Wordmark />
            </div>
          </div>

          <div className="flex items-center gap-1">
            <AlertsBell />
            <AccountMenu user={user} onWaiterMode={() => navigate("/waiter")} onLogout={handleLogout} />
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
