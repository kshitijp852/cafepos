import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import {
  CaretDown,
  CaretLineLeft,
  CaretLineRight,
  DeviceMobile,
  List,
  SignOut,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";

import { useAuth } from "@/auth/AuthContext";
import { cn } from "@/lib/utils";
import { useCafe, useProfile } from "@/api/queries";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertsBell } from "@/components/AlertsBell";
import { OfflineStatus } from "@/components/OfflineStatus";
import { SidebarNav, Wordmark } from "@/components/Sidebar";

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function AccountMenu({
  user,
  onProfile,
  onWaiterMode,
  onLogout,
}: {
  user: User | null;
  onProfile: () => void;
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
              onProfile();
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent"
          >
            <UserCircle size={18} />
            Profile
          </button>
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

const SIDEBAR_COLLAPSED_KEY = "cafepos.sidebarCollapsed";

export function AppLayout() {
  const { user, logout } = useAuth();
  const { data: cafe } = useCafe();
  // Accounts created before GST became mandatory still need to supply one.
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1",
  );

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "relative hidden lg:flex shrink-0 flex-col border-r border-border transition-[width] duration-200",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Wordmark collapsed={collapsed} />
          <Button
            variant="ghost"
            size="icon"
            className={cn(collapsed && "absolute right-[-14px] h-7 w-7 border border-border bg-background shadow")}
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <CaretLineRight size={16} /> : <CaretLineLeft size={16} />}
          </Button>
        </div>
        <SidebarNav collapsed={collapsed} />
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
            {cafe?.name ? (
              <h1 className="font-serif text-lg font-bold tracking-tight text-foreground truncate">
                {cafe.name}
              </h1>
            ) : (
              <div className="lg:hidden">
                <Wordmark />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <OfflineStatus />
            <AlertsBell />
            <AccountMenu
              user={user}
              onProfile={() => navigate("/profile")}
              onWaiterMode={() => navigate("/waiter")}
              onLogout={handleLogout}
            />
          </div>
        </header>

        {profile?.gst_required && (
          <Link
            to="/profile"
            className="flex items-center gap-2 border-b border-danger bg-danger/10 px-4 py-2 text-sm hover:bg-danger/20 lg:px-6"
          >
            <WarningCircle size={16} className="shrink-0 text-danger" />
            <span>
              <b>GST number missing.</b> Bills are not tax-compliant until you add it — open Profile.
            </span>
          </Link>
        )}

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
