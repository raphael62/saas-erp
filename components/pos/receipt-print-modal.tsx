"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const SepLine = () => (
  <div
    style={{
      width: "100%",
      margin: "4px 0",
      minHeight: 1,
      borderBottom: "1px dashed currentColor",
      opacity: 0.7,
    }}
  />
);

function fmtNum(value: number, decimals = 2) {
  const num = Number.isFinite(value) ? value : 0;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export type ReceiptLineItem = {
  item: string;
  unit: string;
  qty: string | number;
  price: number;
  amount: number;
};

export type ReceiptEmptiesReceived = {
  emptiesType: string;
  qtyCtn: number;
};

export type ReceiptPrintData = {
  companyName: string;
  locationName: string;
  locationPhone?: string;
  orgPhone?: string;
  invNo: string;
  cashier: string;
  salesRep: string;
  date: string;
  time: string;
  lines: ReceiptLineItem[];
  netTotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  emptiesDeposit: number;
  grandTotal: number;
  amountPaid: number;
  change: number;
  emptiesReceived: ReceiptEmptiesReceived[];
};

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
  widthMm: initialWidthMm = 100,
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
          <title>Receipt</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 13px; margin: 0; padding: 8px; font-variant-numeric: tabular-nums; }
            .receipt { width: ${widthMm}mm; max-width: ${widthMm}mm; }
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
              Thermal preview ({widthMm}mm) — prints original + duplicate
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={widthMm}
              className="h-8 rounded border border-input bg-background px-2 text-sm"
              onChange={(e) => setWidthMm(Number(e.target.value))}
            >
              <option value={100}>100mm</option>
              <option value={80}>80mm</option>
              <option value={58}>58mm</option>
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

        <div
          ref={printRef}
          className="overflow-x-auto p-4 receipt-figures"
          style={{
            width: `${widthMm}mm`,
            maxWidth: "100%",
            fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
            fontSize: "13px",
            lineHeight: 1.4,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {!data ? (
            <p className="text-muted-foreground">No receipt data</p>
          ) : (
            <div className="w-full whitespace-pre-wrap break-words">
              <div className="text-center">
                <p className="font-semibold">{data.companyName}</p>
                <p>{data.locationName}</p>
                {data.locationPhone ? <p>Tel: {data.locationPhone}</p> : null}
                {data.orgPhone ? <p>Tel: {data.orgPhone}</p> : null}
                <p className="mt-1 font-semibold">ORIGINAL RECEIPT</p>
              </div>

              <SepLine />

              <div className="flex justify-between gap-4">
                <div>
                  <p>Inv No. {data.invNo}</p>
                  <p>Cashier: {data.cashier}</p>
                  <p>Sales Rep: {data.salesRep}</p>
                </div>
                <div className="text-right">
                  <p>Date: {data.date}</p>
                  <p>Time: {data.time}</p>
                </div>
              </div>

              <SepLine />

              <div className="flex gap-1 font-semibold" style={{ justifyContent: "space-between" }}>
                <span style={{ width: "42%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Item</span>
                <span style={{ width: "8%" }}>Unit</span>
                <span style={{ width: "12%", textAlign: "right" }}>Qty</span>
                <span style={{ width: "18%", textAlign: "right" }}>Price</span>
                <span style={{ width: "20%", textAlign: "right" }}>Amt</span>
              </div>
              <SepLine />

              {data.lines.map((line, i) => (
                <div key={i} className="flex gap-1" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span style={{ width: "42%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={line.item}>{line.item}</span>
                  <span style={{ width: "8%" }}>{line.unit}</span>
                  <span style={{ width: "12%", textAlign: "right" }}>{String(line.qty)}</span>
                  <span style={{ width: "18%", textAlign: "right" }}>{fmtNum(line.price, 2)}</span>
                  <span style={{ width: "20%", textAlign: "right" }}>{fmtNum(line.amount, 2)}</span>
                </div>
              ))}

              <SepLine />

              <div className="space-y-0.5">
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
                      <span>{data.emptiesDeposit > 0 ? "Empties Deposit" : "Empties Refund"}:</span>
                      <span>{fmtNum(data.emptiesDeposit, 2)}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>GRAND TOTAL:</span>
                      <span>{fmtNum(data.grandTotal, 2)}</span>
                    </div>
                  </>
                )}
              </div>

              <SepLine />

              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span>Amt Paid:</span>
                  <span>{fmtNum(data.amountPaid, 2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>CHANGE:</span>
                  <span>{fmtNum(data.change, 2)}</span>
                </div>
              </div>

              {data.emptiesReceived.length > 0 && (
                <>
                  <SepLine />
                  <p className="text-center font-semibold">EMPTIES RECEIVED</p>
                  {data.emptiesReceived.map((er, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{er.emptiesType}</span>
                      <span>{fmtNum(er.qtyCtn, 0)} ctn</span>
                    </div>
                  ))}
                </>
              )}

              <SepLine />

              <div className="space-y-0.5 text-center">
                <p className="font-semibold">THANK YOU FOR DOING BUSINESS WITH US</p>
                <p>GOODS SOLD ARE NOT RETURNABLE</p>
                <p>***WE ALWAYS WELCOME YOU***</p>
              </div>
            </div>
          )}
        </div>

        <p className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
          Tip: in the print dialog, set margins to none and choose your thermal printer.
        </p>
      </div>
    </>
  );
}
