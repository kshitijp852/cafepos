import type { FoodType } from "@/lib/types";
import { cn } from "@/lib/utils";

// Indian-standard food marker: bordered square with a centered dot.
// green = veg, red = non-veg, amber = egg.
const COLOR: Record<FoodType, string> = {
  veg: "border-success text-success",
  non_veg: "border-danger text-danger",
  egg: "border-warning text-warning",
};

export function FoodTypeMarker({ type, size = 14 }: { type?: FoodType | null; size?: number }) {
  if (!type) return null;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center border bg-card", COLOR[type])}
      style={{ width: size, height: size }}
      title={type === "non_veg" ? "Non-veg" : type === "egg" ? "Egg" : "Veg"}
      aria-label={type}
    >
      {/* Round dot (inline radius: the veg/non-veg symbol is a circle by convention). */}
      <span className="bg-current" style={{ width: size * 0.45, height: size * 0.45, borderRadius: "9999px" }} />
    </span>
  );
}
