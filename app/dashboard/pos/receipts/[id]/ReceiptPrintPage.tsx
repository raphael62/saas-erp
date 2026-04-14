"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { refundPosReceipt, refundPosReceiptLine } from "@/app/dashboard/pos/actions";
import {
  ThermalReceiptContent,
  THERMAL_RECEIPT_GOOGLE_FONT_HREF,
  thermalReceiptPrintCss,
  thermalReceiptPrintHeadInnerHtml,
  runThermalReceiptPrint,
  type ReceiptPrintData,
} from "@/components/pos/receipt-thermal-content";

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

type ReceiptData = ReceiptPrintData;

export function ReceiptPrintPage({
  data,
  invoiceId,
  refundedAt,
  receiptLines,
  allowRefund = true,
}: {
  data: ReceiptData;
  invoiceId: string;
  refundedAt: string | null;
  receiptLines: ReceiptLine[];
  allowRefund?: boolean;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [refunding, setRefunding] = useState<string | null>(null);
  const widthMm = 80;

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
          <meta charset="utf-8" />
          <title>Receipt ${data.invNo}</title>
          ${thermalReceiptPrintHeadInnerHtml()}
          <style>${thermalReceiptPrintCss(widthMm)}</style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `);
    printWindow.document.close();
    runThermalReceiptPrint(printWindow);
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
          ) : allowRefund ? (
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
          ) : null}
        </span>
      </div>

      <div className="no-print rounded border border-border bg-muted/30 p-4">
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={THERMAL_RECEIPT_GOOGLE_FONT_HREF} rel="stylesheet" />
        <style>{thermalReceiptPrintCss(widthMm)}</style>
        <div
          ref={printRef}
          className="rounded border border-border bg-white shadow-sm"
          style={{
            width: `${widthMm}mm`,
            maxWidth: "100%",
            margin: "0 auto",
            padding: "8px",
          }}
        >
          <ThermalReceiptContent variant="reprint" data={data} />
        </div>
      </div>

      {!refundedAt && allowRefund && receiptLines.length > 0 && (
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
