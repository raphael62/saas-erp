"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { refundPosReceipt, refundPosReceiptLine } from "@/app/dashboard/pos/actions";

function fmtNum(value: number, decimals = 2) {
  return (Number.isFinite(value) ? value : 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

type ReceiptLine = {
  lineId: string;
  item: string;
  unit: string;
  qty: number;
  price: number;
  amount: number;
  isFullyRefunded: boolean;
};

type ReceiptData = {
  companyName: string;
  locationName: string;
  locationPhone?: string;
  orgPhone?: string;
  invNo: string;
  cashier: string;
  salesRep: string;
  customerName?: string;
  date: string;
  time: string;
  lines: Array<{ item: string; unit: string; qty: number; price: number; amount: number }>;
  netTotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  emptiesDeposit: number;
  grandTotal: number;
  amountPaid: number;
  change: number;
  emptiesReceived: Array<{ emptiesType: string; qtyCtn: number }>;
};

export function ReceiptPrintPage({
  data,
  invoiceId,
  refundedAt,
  receiptLines,
}: {
  data: ReceiptData;
  invoiceId: string;
  refundedAt: string | null;
  receiptLines: ReceiptLine[];
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [refunding, setRefunding] = useState<string | null>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    const clone = printRef.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".no-print").forEach((el) => el.remove());
    const printContent = clone.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt ${data.invNo}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 13px; margin: 0; padding: 8px; font-variant-numeric: tabular-nums; }
            .receipt { width: 80mm; max-width: 100mm; }
          </style>
        </head>
        <body>
          <div class="receipt">${printContent}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handleFullRefund = async () => {
    if (refundedAt) return;
    if (!confirm(`Refund entire receipt ${data.invNo}? This cannot be undone.`)) return;
    setRefunding("receipt");
    try {
      const res = await refundPosReceipt(invoiceId);
      if (res.error) alert(res.error);
      else router.refresh();
    } finally {
      setRefunding(null);
    }
  };

  const handleLineRefund = async (lineId: string) => {
    setRefunding(lineId);
    try {
      const res = await refundPosReceiptLine(lineId);
      if (res.error) alert(res.error);
      else router.refresh();
    } finally {
      setRefunding(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/dashboard/pos/receipts"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to Receipts
        </Link>
        <span className="flex items-center gap-2">
          <Button
            size="sm"
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={handlePrint}
          >
            Print Receipt
          </Button>
          {refundedAt ? (
            <span className="text-sm text-muted-foreground">Refunded</span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10 no-print"
              onClick={handleFullRefund}
              disabled={!!refunding}
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              Refund Receipt
            </Button>
          )}
        </span>
      </div>

      <div
        ref={printRef}
        className="rounded border border-border bg-white p-6 font-mono text-sm"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        <div className="text-center">
          <p className="font-semibold">{data.companyName}</p>
          <p>{data.locationName}</p>
          {data.locationPhone ? <p>Tel: {data.locationPhone}</p> : null}
          {data.orgPhone ? <p>Tel: {data.orgPhone}</p> : null}
          <p className="mt-1 font-semibold">REPRINT</p>
        </div>

        <div className="my-2 border-b border-dashed border-border" />

        <div className="flex justify-between gap-4 text-sm">
          <div>
            <p>Inv No. {data.invNo}</p>
            <p>Cashier: {data.cashier}</p>
            <p>Sales Rep: {data.salesRep}</p>
          </div>
          <div className="text-right">
            <p>Date: {data.date}</p>
            {data.time ? <p>Time: {data.time}</p> : null}
          </div>
        </div>

        <div className="my-2 border-b border-dashed border-border" />

        <div className="space-y-1 text-sm">
          {data.lines.map((line, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{line.item}</span>
              <span className="shrink-0">{line.unit}</span>
              <span className="shrink-0">{line.qty}</span>
              <span className="shrink-0">{fmtNum(line.price, 2)}</span>
              <span className="shrink-0">{fmtNum(line.amount, 2)}</span>
            </div>
          ))}
        </div>

        <div className="my-2 border-b border-dashed border-border" />

        <div className="space-y-0.5 text-sm">
          <div className="flex justify-between">
            <span>Net Total:</span>
            <span>{fmtNum(data.netTotal, 2)}</span>
          </div>
          <div className="flex justify-between">
            <span>VAT@{fmtNum(data.vatRate, 0)}%:</span>
            <span>{fmtNum(data.vatAmount, 2)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>TOTAL:</span>
            <span>{fmtNum(data.total, 2)}</span>
          </div>
          {data.emptiesDeposit !== 0 && (
            <>
              <div className="flex justify-between">
                <span>Empties Deposit:</span>
                <span>{fmtNum(data.emptiesDeposit, 2)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>GRAND TOTAL:</span>
                <span>{fmtNum(data.grandTotal, 2)}</span>
              </div>
            </>
          )}
        </div>

        <div className="my-2 border-b border-dashed border-border" />

        <div className="text-center text-xs text-muted-foreground">
          <p>THANK YOU FOR DOING BUSINESS WITH US</p>
        </div>
      </div>

      {!refundedAt && receiptLines.length > 0 && (
        <div className="rounded border border-border bg-muted/20 p-4">
          <h3 className="mb-3 text-sm font-semibold">Refund by item</h3>
          <div className="space-y-2">
            {receiptLines.map((line) => (
              <div
                key={line.lineId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-background px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{line.item}</span>
                <span className="shrink-0 text-muted-foreground">
                  {line.qty} {line.unit} × {fmtNum(line.price, 2)} = {fmtNum(line.amount, 2)}
                </span>
                {line.isFullyRefunded ? (
                  <span className="shrink-0 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                    Refunded
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => handleLineRefund(line.lineId)}
                    disabled={!!refunding}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Refund
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
