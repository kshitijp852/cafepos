import { useState } from "react";
import { Printer } from "@phosphor-icons/react";
import { toast } from "sonner";

import { errorMessage } from "@/api/client";
import { closeDaySession, openDaySession, printBill } from "@/api/endpoints";
import { useBills, useCurrentSession, useDailyReport, useInvalidate } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr } from "@/lib/format";

export function HistoryPage() {
  const { data: bills = [] } = useBills(100);
  const { data: session } = useCurrentSession();
  const { data: report } = useDailyReport();
  const invalidate = useInvalidate();

  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");

  const open = async () => {
    try {
      await openDaySession({ opening_cash: parseFloat(openingCash) || 0 });
      setOpeningCash("");
      await invalidate(["session", "report"]);
      toast.success("Day session opened");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to open session"));
    }
  };

  const close = async () => {
    if (!session) return;
    try {
      await closeDaySession({ session_id: session.id, closing_cash: parseFloat(closingCash) || 0 });
      setClosingCash("");
      await invalidate(["session", "report"]);
      toast.success("Day session closed");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to close session"));
    }
  };

  const reprint = async (billId: string) => {
    try {
      await printBill(billId);
      toast.success("Sent to printer (mocked)");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to print"));
    }
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <h2 className="font-serif text-2xl font-bold">History &amp; Day Session</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="font-semibold text-sm">Day Session</h3>
            {session ? (
              <>
                <p className="text-sm text-muted-foreground nums">Opened with {inr(session.opening_cash)}</p>
                <p className="text-sm text-muted-foreground nums">Expected cash: {inr(session.expected_cash ?? 0)}</p>
                <div className="flex gap-2 pt-1">
                  <Input
                    type="number"
                    placeholder="Closing cash"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                  />
                  <Button variant="outline" onClick={close}>
                    Close
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Opening cash"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                />
                <Button onClick={open}>Open</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-2 uppercase tracking-wide text-muted-foreground">Today</h3>
            <p className="font-serif text-3xl font-bold nums">{inr(report?.total_sales ?? 0)}</p>
            <p className="text-sm text-muted-foreground nums">{report?.total_bills ?? 0} bills</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-2 uppercase tracking-wide text-muted-foreground">Payment Split</h3>
            <div className="text-sm space-y-1 nums">
              <div className="flex justify-between"><span className="text-muted-foreground">Cash</span><span>{inr(report?.payment_breakdown?.cash ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Card</span><span>{inr(report?.payment_breakdown?.card ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">UPI</span><span>{inr(report?.payment_breakdown?.upi ?? 0)}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill #</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Print</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium nums">#{b.bill_number}</TableCell>
                  <TableCell className="text-sm text-muted-foreground nums">
                    {b.items.reduce((n, i) => n + i.quantity, 0)} items
                  </TableCell>
                  <TableCell className="capitalize">{b.payment_method}</TableCell>
                  <TableCell className="text-right font-medium nums">{inr(b.total)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => reprint(b.id)}>
                      <Printer className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {bills.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No bills yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
