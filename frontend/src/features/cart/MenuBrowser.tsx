import { useMemo, useState } from "react";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/format";
import type { Category, MenuItem } from "@/lib/types";

interface Props {
  items: MenuItem[];
  categories: Category[];
  onAdd: (item: MenuItem) => void;
  onlyAvailable?: boolean;
}

/** Searchable, category-filtered menu grid shared across ordering screens. */
export function MenuBrowser({ items, categories, onAdd, onlyAvailable = false }: Props) {
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => (onlyAvailable ? i.available : true))
      .filter((i) => category === "all" || i.category_id === category)
      .filter((i) => !q || i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q));
  }, [items, category, query, onlyAvailable]);

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 space-y-3 border-b border-border bg-background p-4">
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search menu…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 bg-secondary pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={category === "all" ? "default" : "outline"} size="sm" onClick={() => setCategory("all")}>
            All
          </Button>
          {categories.map((c) => (
            <Button
              key={c.id}
              variant={category === c.id ? "default" : "outline"}
              size="sm"
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-12">No items found</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => onAdd(item)}
                className="group border border-border p-4 text-left transition-colors hover:border-success hover:bg-success/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{item.name}</div>
                    <div className="nums mt-0.5 text-sm font-semibold">{inr(item.price)}</div>
                  </div>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-success text-success-foreground transition-transform group-hover:scale-110">
                    <Plus size={15} weight="bold" />
                  </span>
                </div>
                <div className="mt-2 text-[0.65rem] font-semibold uppercase tracking-wide text-success opacity-0 transition-opacity group-hover:opacity-100">
                  Tap to add
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
