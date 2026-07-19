import { useEffect, useState } from "react";
import { Clock } from "@phosphor-icons/react";

import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

// Live "how long the customer has been seated" counter, ticking every second
// from the table's seated_at until the bill is settled (table freed).
export function DwellTimer({ seatedAt, className }: { seatedAt: string; className?: string }) {
  const start = new Date(seatedAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (Number.isNaN(start)) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 nums tabular-nums", className)}>
      <Clock size={12} weight="bold" />
      {formatDuration((now - start) / 1000)}
    </span>
  );
}
