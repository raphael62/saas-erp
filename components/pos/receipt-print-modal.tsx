"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ThermalReceiptPrintSlips,
  THERMAL_RECEIPT_GOOGLE_FONT_HREF,
  thermalReceiptPrintCss,
  thermalReceiptPrintHeadInnerHtml,
  runThermalReceiptPrint,
  type ReceiptPrintData,
} from "@/components/pos/receipt-thermal-content";

export type {
  ReceiptLineItem,
  ReceiptEmptiesReceived,
  ReceiptPrintData,
} from "@/components/pos/receipt-thermal-content";

type ReceiptPrintModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReceiptPrintData | null;
  widthMm?: number;
};

export function ReceiptPrintModal({
  open,
  onOpenChange,
  data,
  widthMm: initialWidthMm = 80,
}: ReceiptPrintModalProps) {
  const [widthMm, setWidthMm] = useState(initialWidthMm);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt</title>
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

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">{data?.invNo ?? "Receipt"}</h2>
            <p className="text-sm text-muted-foreground">
              Thermal preview ({widthMm} mm) — match your printer paper width
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={widthMm}
              className="h-8 rounded border border-input bg-background px-2 text-sm"
              onChange={(e) => setWidthMm(Number(e.target.value))}
            >
              <option value={80}>80 mm</option>
              <option value={58}>58 mm</option>
              <option value={100}>100 mm</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              size="sm"
              className="border-transparent bg-green-600 text-white hover:bg-green-700"
              onClick={handlePrint}
            >
              Print
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto p-4">
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href={THERMAL_RECEIPT_GOOGLE_FONT_HREF} rel="stylesheet" />
          <style>{thermalReceiptPrintCss(widthMm)}</style>
          <div
            ref={printRef}
            style={{
              width: `${widthMm}mm`,
              maxWidth: "100%",
              margin: "0 auto",
            }}
          >
            {!data ? (
              <p className="text-muted-foreground">No receipt data</p>
            ) : (
              <ThermalReceiptPrintSlips data={data} />
            )}
          </div>
        </div>

        <p className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
          Tip: Preview shows one copy; Print outputs Original and Duplicate (two pages). Use minimum margins and your thermal printer.
        </p>
      </div>
    </>
  );
}
