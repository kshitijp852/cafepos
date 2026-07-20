import { useState } from "react";
import { CalendarPlus, X } from "@phosphor-icons/react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import { cancelReservation, createReservation, type ReservationInput } from "@/api/endpoints";
import { useFloors, useInvalidate, useReservations, useTables } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const EMPTY: ReservationInput = {
  table_id: "",
  customer_name: "",
  customer_phone: "",
  guest_count: 2,
  reservation_date: "",
  reservation_time: "",
  notes: "",
};

export function ReservationsPage() {
  const { data: reservations = [] } = useReservations();
  const { data: tables = [] } = useTables();
  const { data: floors = [] } = useFloors();
  const invalidate = useInvalidate();
  const [form, setForm] = useState<ReservationInput>(EMPTY);

  const set = <K extends keyof ReservationInput>(k: K, v: ReservationInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.table_id || !form.customer_name || !form.reservation_date || !form.reservation_time)
      return toast.error("Table, name, date and time are required");
    try {
      await createReservation(form);
      setForm(EMPTY);
      await invalidate(["reservations", "tables"]);
      toast.success("Reservation created");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to create reservation"));
    }
  };

  const cancel = async (id: string) => {
    try {
      await cancelReservation(id);
      await invalidate(["reservations", "tables"]);
      toast.success("Reservation cancelled");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to cancel"));
    }
  };

  const tableName = (id: string) => tables.find((t) => t.id === id)?.name ?? id;
  const active = reservations.filter((r) => r.status !== "cancelled");

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Reservations</h1>
        <p className="text-sm text-muted-foreground">Book tables ahead and track upcoming guests.</p>
      </div>

      {/* New reservation */}
      <section className="border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <CalendarPlus size={18} />
          <h2 className="text-sm font-semibold uppercase tracking-wide">New reservation</h2>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label>Table</Label>
            <Select value={form.table_id} onValueChange={(v) => set("table_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select table" />
              </SelectTrigger>
              <SelectContent>
                {floors.map((floor) => {
                  const floorTables = tables.filter((t) => t.floor_id === floor.id);
                  if (floorTables.length === 0) return null;
                  return (
                    <SelectGroup key={floor.id}>
                      <SelectLabel>{floor.name}</SelectLabel>
                      {floorTables.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} (seats {t.capacity})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Customer name</Label>
            <Input value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input
              inputMode="numeric"
              value={form.customer_phone}
              onChange={(e) => set("customer_phone", e.target.value.replace(/[^\d+\s-]/g, ""))}
            />
          </div>
          <div className="space-y-1">
            <Label>Guests</Label>
            <Input type="number" min={1} value={form.guest_count} onChange={(e) => set("guest_count", parseInt(e.target.value) || 1)} />
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={form.reservation_date} onChange={(e) => set("reservation_date", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Time</Label>
            <Input type="time" value={form.reservation_time} onChange={(e) => set("reservation_time", e.target.value)} />
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-3">
            <Button onClick={submit}>
              <CalendarPlus size={16} /> Create reservation
            </Button>
          </div>
        </div>
      </section>

      {/* Upcoming */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Upcoming ({active.length})
        </h2>
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Customer</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="px-4 text-right">Cancel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="px-4">
                    <div className="font-medium">{r.customer_name}</div>
                    {r.customer_phone && <div className="text-xs text-muted-foreground nums">{r.customer_phone}</div>}
                  </TableCell>
                  <TableCell>{tableName(r.table_id)}</TableCell>
                  <TableCell className="nums">{r.guest_count}</TableCell>
                  <TableCell className="nums">
                    {r.reservation_date} · {r.reservation_time}
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    <Button variant="ghost" size="icon" className="text-danger" aria-label="Cancel reservation" onClick={() => cancel(r.id)}>
                      <X size={17} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {active.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No upcoming reservations.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
