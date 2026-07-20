import { CloudArrowUp, WifiSlash } from "@phosphor-icons/react";

import { useOnline } from "@/lib/online";
import { usePendingSync } from "@/lib/offlineQueue";

// Inline connectivity chip, meant to sit inside a page header so it never covers
// the title bar. Offline: orders/bills are saved locally and held. Back online
// with a backlog: shows it draining so staff know unsynced sales are on the way up.
export function OfflineStatus({ compact = false }: { compact?: boolean }) {
  const online = useOnline();
  const pending = usePendingSync();

  if (!online) {
    return (
      <Chip
        className="bg-amber-500 text-black"
        title={`Offline — ${pending} saved on this device, orders sync when the connection returns.`}
      >
        <WifiSlash size={14} weight="bold" />
        {!compact && <span>Offline</span>}
        {pending > 0 && <span className="nums font-bold">{pending}</span>}
      </Chip>
    );
  }

  if (pending > 0) {
    return (
      <Chip className="bg-sky-500 text-white" title={`Syncing ${pending} saved item(s)…`}>
        <CloudArrowUp size={14} weight="bold" />
        {!compact && <span>Syncing</span>}
        <span className="nums font-bold">{pending}</span>
      </Chip>
    );
  }

  return null;
}

function Chip({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div
      role="status"
      title={title}
      className={`flex shrink-0 items-center gap-1.5 px-2 py-1 text-xs font-medium ${className}`}
    >
      {children}
    </div>
  );
}
