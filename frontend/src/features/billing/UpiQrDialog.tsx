import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "@/components/ui/sonner";

import { errorMessage } from "@/api/client";
import {
  cancelPaymentRequest,
  getPaymentRequest,
  simulateUpiPayment,
  type PaymentRequest,
} from "@/api/endpoints";
import { usePaymentSettings } from "@/api/queries";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr } from "@/lib/format";
import { onLiveEvent } from "@/lib/liveEvents";

interface Props {
  request: PaymentRequest | null;
  // Called once the gateway confirms payment and the server has settled the bill.
  onPaid: (billId: string) => void;
  // QR cancelled or closed without payment.
  onClose: () => void;
}

// Shows the bill's dynamic UPI QR and waits for the payment webhook. Payment
// arrives as a live event; polling the request is the fallback.
export function UpiQrDialog({ request, onPaid, onClose }: Props) {
  const { user } = useAuth();
  const { data: settings } = usePaymentSettings();
  const [simulating, setSimulating] = useState(false);
  const canSimulate = settings?.provider === "mock" && (user?.role === "owner" || user?.role === "superadmin");

  useEffect(() => {
    if (!request) return;
    let done = false;
    const finish = (billId: string) => {
      if (done) return;
      done = true;
      onPaid(billId);
    };
    const off = onLiveEvent((e) => {
      if (e.event === "payment_settled" && e.data.payment_request_id === request.id) finish(e.data.bill_id);
    });
    const poll = setInterval(async () => {
      try {
        const r = await getPaymentRequest(request.id);
        if (r.status === "paid" && r.bill_id) finish(r.bill_id);
        if (r.status === "cancelled" && !done) {
          done = true;
          toast.error("This QR was replaced or the bill was settled another way.");
          onClose();
        }
      } catch {
        /* keep waiting */
      }
    }, 3000);
    return () => {
      off();
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id]);

  const cancel = async () => {
    if (request) await cancelPaymentRequest(request.id).catch(() => undefined);
    onClose();
  };

  const simulate = async () => {
    if (!request) return;
    setSimulating(true);
    try {
      await simulateUpiPayment(request.amount, request.reference);
    } catch (err) {
      toast.error(errorMessage(err, "Simulation failed"));
    } finally {
      setSimulating(false);
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && cancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">Scan to pay with UPI</DialogTitle>
        </DialogHeader>
        {request && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="bg-white p-3">
              <QRCodeSVG value={request.qr_payload} size={220} marginSize={0} />
            </div>
            <div>
              <p className="font-heading text-3xl font-bold nums">{inr(request.amount)}</p>
              <p className="text-xs text-muted-foreground">Ref {request.reference}</p>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              Waiting for payment. The table closes automatically once it arrives.
            </p>
            <div className="flex w-full gap-2">
              <Button variant="outline" className="flex-1" onClick={cancel}>
                Cancel
              </Button>
              {canSimulate && (
                <Button variant="secondary" className="flex-1" onClick={simulate} disabled={simulating}>
                  {simulating ? "Sending…" : "Simulate payment"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
