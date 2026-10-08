import { Outlet } from "react-router-dom";

import { PaymentReviewDialog } from "@/features/billing/PaymentReviewDialog";
import { useLiveEvents } from "@/lib/liveEvents";

// Wraps the manager app (ordering screens + main layout): keeps the live event
// stream open so UPI payments and settles on other devices show up at once, and
// asks which table an unmatched UPI payment belongs to.
export function LiveShell() {
  useLiveEvents();
  return (
    <>
      <Outlet />
      <PaymentReviewDialog />
    </>
  );
}
