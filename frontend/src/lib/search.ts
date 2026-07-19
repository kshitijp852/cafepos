import type { Floor, Table } from "@/lib/types";

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().trim();

export function matchesTable(t: Table, q: string): boolean {
  const n = norm(q);
  if (!n) return true;
  return norm(t.name).includes(n) || norm(t.code).includes(n);
}

export type FloorGroup = { floor: Floor; tables: Table[]; highlight: boolean };

/** Group tables under their floors, applying a table/floor search.
 *  - Empty query: every floor with tables, nothing highlighted.
 *  - Floor name matches: show all its tables, title highlighted.
 *  - Otherwise: show only matching tables; title highlighted if any match.
 *  Floors with no match are dropped. */
export function searchFloors(floors: Floor[], tables: Table[], query: string): FloorGroup[] {
  const q = norm(query);
  const groups: FloorGroup[] = [];
  for (const floor of floors) {
    const floorTables = tables.filter((t) => t.floor_id === floor.id);
    if (floorTables.length === 0) continue;

    if (!q) {
      groups.push({ floor, tables: floorTables, highlight: false });
      continue;
    }
    const floorMatch = norm(floor.name).includes(q);
    const shown = floorMatch ? floorTables : floorTables.filter((t) => matchesTable(t, q));
    if (floorMatch || shown.length > 0) {
      groups.push({ floor, tables: shown, highlight: true });
    }
  }
  return groups;
}
