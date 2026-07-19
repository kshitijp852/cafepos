import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MagnifyingGlass, SignOut } from "@phosphor-icons/react";

import { waiterLogout } from "@/api/endpoints";
import { useDevice, useFloors, useTables } from "@/api/queries";
import { useAuth } from "@/auth/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DwellTimer } from "@/components/DwellTimer";
import { cn } from "@/lib/utils";
import { searchFloors } from "@/lib/search";
import type { Table, TableStatus } from "@/lib/types";

const STATUS_STYLE: Record<TableStatus, string> = {
  available: "border-success/60 bg-success/20 text-foreground hover:bg-success/30",
  occupied: "border-warning bg-warning/10 text-foreground hover:bg-warning/20",
  reserved: "border-info/60 bg-info/15 text-foreground hover:bg-info/25",
};

export function WaiterTablesPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { data: tables = [] } = useTables();
  const { data: floors = [] } = useFloors();
  const { data: device } = useDevice();
  const assigned = device?.assigned_user?.name;
  const [query, setQuery] = useState("");
  const groups = searchFloors(floors, tables, query);

  const openTable = (table: Table) => navigate(`/waiter/order/${table.id}`, { state: { table } });

  const handleLogout = async () => {
    // Tell the backend so the manager panel shows this device as logged out.
    // Best-effort: sign out locally regardless of the network call.
    const deviceId = localStorage.getItem("waiter_device_id");
    if (deviceId) await waiterLogout(deviceId).catch(() => {});
    logout();
    navigate("/waiter", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-xl font-bold">{device?.device_name || "Café POS"}</h1>
          <Badge variant="outline">Waiter</Badge>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm sm:block">
            {assigned ? (
              <>Waiter: <span className="font-medium">{assigned}</span></>
            ) : (
              <span className="text-muted-foreground">No waiter assigned</span>
            )}
          </span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <SignOut size={16} />
            Logout
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 space-y-8">
        {floors.length === 0 && tables.length === 0 && (
          <p className="text-center text-muted-foreground">No tables configured yet. Ask your manager to add tables.</p>
        )}
        {tables.length > 0 && (
          <div className="relative max-w-sm">
            <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search table or floor…"
              className="pl-9"
            />
          </div>
        )}
        {groups.map(({ floor, tables: floorTables, highlight }) => {
          return (
            <section key={floor.id}>
              <h2
                className={cn(
                  "mb-3 inline-block text-sm font-semibold uppercase tracking-wide",
                  highlight ? "bg-accent px-2 py-0.5 text-foreground" : "text-muted-foreground",
                )}
              >
                {floor.name}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {floorTables.map((table) => (
                  <button
                    key={table.id}
                    onClick={() => openTable(table)}
                    className={cn(
                      "flex aspect-square flex-col items-center justify-center gap-1 border p-3 transition-colors",
                      STATUS_STYLE[table.status],
                    )}
                  >
                    <div className="font-serif text-3xl font-bold">{table.name}</div>
                    <div className="text-[0.65rem] font-semibold uppercase tracking-wide">{table.status}</div>
                    {table.seated_at ? (
                      <DwellTimer seatedAt={table.seated_at} className="text-[0.65rem] text-muted-foreground" />
                    ) : (
                      <div className="text-[0.65rem] text-muted-foreground">{table.capacity} seats</div>
                    )}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {query && groups.length === 0 && (
          <p className="text-center text-muted-foreground">No tables or floors match “{query}”.</p>
        )}
      </main>
    </div>
  );
}
