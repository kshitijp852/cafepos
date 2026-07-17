import { useNavigate } from "react-router-dom";
import { SignOut } from "@phosphor-icons/react";

import { useFloors, useTables } from "@/api/queries";
import { useAuth } from "@/auth/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Table, TableStatus } from "@/lib/types";

const STATUS_STYLE: Record<TableStatus, string> = {
  available: "border-border hover:border-foreground hover:bg-accent",
  occupied: "border-warning bg-warning/10 text-foreground hover:bg-warning/20",
  reserved: "border-foreground/30 bg-secondary text-foreground hover:bg-accent",
};

export function WaiterTablesPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: tables = [] } = useTables();
  const { data: floors = [] } = useFloors();

  const openTable = (table: Table) => navigate(`/waiter/order/${table.id}`, { state: { table } });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-xl font-bold">Café POS</h1>
          <Badge variant="outline">Waiter</Badge>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm font-medium sm:block">{user?.name}</span>
          <Button variant="outline" size="sm" onClick={() => { logout(); navigate("/waiter", { replace: true }); }}>
            <SignOut size={16} />
            Logout
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 space-y-8">
        {floors.length === 0 && tables.length === 0 && (
          <p className="text-center text-muted-foreground">No tables configured yet. Ask your manager to add tables.</p>
        )}
        {floors.map((floor) => {
          const floorTables = tables.filter((t) => t.floor_id === floor.id);
          if (floorTables.length === 0) return null;
          return (
            <section key={floor.id}>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">{floor.name}</h2>
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
                    <div className="text-[0.65rem] text-muted-foreground">{table.capacity} seats</div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
