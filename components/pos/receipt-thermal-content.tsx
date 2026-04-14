/** Shared 80mm-style thermal receipt markup + print CSS (POS checkout + reprint). */

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

export function fmtReceiptNum(value: number, decimals = 2) {
  const num = Number.isFinite(value) ? value : 0;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Google Fonts — B612 Mono is built for cockpit-style legibility (digits like 0 vs 8 deliberately unambiguous). */
export const THERMAL_RECEIPT_GOOGLE_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=B612+Mono:wght@400;700&display=swap";

/** `<head>` tags for a standalone print window (loads B612 Mono before print CSS). */
export function thermalReceiptPrintHeadInnerHtml(): string {
  return `
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${THERMAL_RECEIPT_GOOGLE_FONT_HREF}" rel="stylesheet" />
  `;
}

export function receiptDisplayFirstName(fullName: string): string {
  const t = String(fullName ?? "").trim();
  if (!t) return "—";
  const first = t.split(/\s+/)[0];
  return first || "—";
}

/** Wait for webfonts in the print document so digits use B612 Mono (not a fuzzy fallback). */
export function runThermalReceiptPrint(printWindow: Window): void {
  const doPrint = () => {
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };
  const fonts = printWindow.document.fonts;
  if (fonts && typeof fonts.ready?.then === "function") {
    void fonts.ready.then(doPrint).catch(() => {
      printWindow.setTimeout(doPrint, 800);
    });
  } else {
    printWindow.setTimeout(doPrint, 800);
  }
}

/** CSS for print dialog and cloned print window. Scope everything under .tr */
export function thermalReceiptPrintCss(widthMm: number): string {
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 8px;
      font-family: "B612 Mono", "Lucida Console", "Courier New", Courier, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.4;
      color: #0a0a0a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-variant-numeric: tabular-nums lining-nums;
      font-feature-settings: "tnum", "lnum";
    }
    .tr {
      width: ${widthMm}mm;
      max-width: ${widthMm}mm;
      margin: 0 auto;
    }
    @media screen {
      .tr-print-second-slip {
        display: none !important;
      }
    }
    @media print {
      .tr-print-second-slip {
        display: block !important;
        break-before: page;
        page-break-before: always;
      }
    }
    .tr-brand {
      text-align: center;
      margin-bottom: 10px;
    }
    .tr-brand-name {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.01em;
      margin: 0 0 4px 0;
      line-height: 1.2;
    }
    .tr-brand-sub {
      margin: 0;
      font-size: 11px;
      line-height: 1.35;
      font-weight: 500;
      white-space: pre-line;
    }
    .tr-brand-tel {
      margin: 3px 0 0;
      font-size: 12px;
    }
    .tr-doc-title {
      margin: 10px 0 0 0;
      font-size: 12px;
      font-weight: 800;
      text-align: left;
      text-transform: uppercase;
      letter-spacing: 0.14em;
    }
    .tr-sep {
      border: none;
      border-top: 2px dotted #1a1a1a;
      margin: 10px 0;
      width: 100%;
      opacity: 1;
    }
    .tr-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 10px;
      font-size: 11px;
      align-items: start;
    }
    .tr-meta-col p {
      margin: 0 0 5px 0;
      line-height: 1.35;
    }
    .tr-meta-col strong {
      font-weight: 700;
      margin-right: 4px;
    }
    .tr-meta-inv {
      margin: 0 0 5px 0;
      line-height: 1.35;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .tr-meta-right {
      text-align: right;
    }
    .tr-lines {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 11px;
      margin: 6px 0 4px 0;
    }
    .tr-lines thead th {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #000000;
      padding: 0 2px 6px 2px;
      border-bottom: 2px dotted #333333;
      vertical-align: bottom;
      line-height: 1.2;
    }
    .tr-lines th:nth-child(1) {
      width: 38%;
      text-align: left;
    }
    .tr-lines th:nth-child(2) {
      width: 11%;
      text-align: center;
    }
    .tr-lines th:nth-child(3) {
      width: 11%;
      text-align: right;
    }
    .tr-lines th:nth-child(4) {
      width: 19%;
      text-align: right;
    }
    .tr-lines th:nth-child(5) {
      width: 21%;
      text-align: right;
    }
    .tr-lines tbody td {
      padding: 4px 1px;
      vertical-align: top;
      border-bottom: 2px dotted #555555;
      font-weight: 500;
      color: #1a1a1a;
    }
    .tr-lines tbody tr:last-child td {
      border-bottom: none;
    }
    .tr-lines .tr-cell-item {
      word-break: break-word;
      overflow-wrap: anywhere;
      hyphens: auto;
      line-height: 1.25;
      font-weight: 500;
      padding-right: 2px;
    }
    .tr-lines .tr-cell-unit {
      text-align: center;
      font-weight: 500;
    }
    .tr-lines .tr-cell-num {
      text-align: right;
      white-space: nowrap;
      font-weight: 500;
    }
    .tr-totals {
      font-size: 11px;
    }
    .tr-totals-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin: 5px 0;
    }
    .tr-totals-row strong {
      font-weight: 800;
    }
    .tr-totals-row--emphasis {
      font-size: 12px;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 2px dotted #333333;
    }
    .tr-pay {
      font-size: 11px;
    }
    .tr-pay-row {
      display: flex;
      justify-content: space-between;
      margin: 5px 0;
      font-weight: 600;
    }
    .tr-subhead {
      text-align: center;
      font-size: 10px;
      font-weight: 800;
      margin: 8px 0 4px 0;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .tr-empties-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin: 3px 0;
    }
    .tr-footer {
      text-align: center;
      font-size: 11px;
      font-weight: 600;
      color: #000000;
      line-height: 1.45;
      margin-top: 10px;
      -webkit-font-smoothing: antialiased;
    }
    .tr-footer p {
      margin: 6px 0;
    }
  `;
}

export function ThermalReceiptContent({
  variant,
  data,
}: {
  variant: "original" | "duplicate" | "reprint";
  data: ReceiptPrintData;
}) {
  const title =
    variant === "duplicate" ? "Duplicate" : variant === "reprint" ? "Reprint" : "Original";
  const locTel = String(data.locationPhone ?? "").trim();
  const coTel = String(data.orgPhone ?? "").trim();

  return (
    <div className="tr">
      <div className="tr-brand">
        <p className="tr-brand-name">{data.companyName}</p>
        {data.locationName ? <p className="tr-brand-sub">{data.locationName}</p> : null}
        {locTel ? <p className="tr-brand-tel">{locTel}</p> : null}
        {coTel && coTel !== locTel ? <p className="tr-brand-tel">{coTel}</p> : null}
      </div>

      <p className="tr-doc-title">{title}</p>

      <hr className="tr-sep" />

      <div className="tr-meta">
        <div className="tr-meta-col">
          <p className="tr-meta-inv">{data.invNo}</p>
          <p>
            <strong>Cashier</strong> {receiptDisplayFirstName(data.cashier)}
          </p>
          <p>
            <strong>Sales Rep</strong> {receiptDisplayFirstName(data.salesRep)}
          </p>
        </div>
        <div className="tr-meta-col tr-meta-right">
          <p>
            <strong>Date</strong> {data.date}
          </p>
          {data.time ? (
            <p>
              <strong>Time</strong> {data.time}
            </p>
          ) : null}
        </div>
      </div>

      <hr className="tr-sep" />

      {data.lines.length > 0 ? (
        <table className="tr-lines">
          <thead>
            <tr>
              <th>Item</th>
              <th>Unit</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Amt.</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line, i) => (
              <tr key={i}>
                <td className="tr-cell-item">{line.item}</td>
                <td className="tr-cell-unit">{line.unit}</td>
                <td className="tr-cell-num">{String(line.qty)}</td>
                <td className="tr-cell-num">{fmtReceiptNum(line.price, 2)}</td>
                <td className="tr-cell-num">{fmtReceiptNum(line.amount, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <hr className="tr-sep" />

      <div className="tr-totals">
        <div className="tr-totals-row">
          <span>Net total</span>
          <span>{fmtReceiptNum(data.netTotal, 2)}</span>
        </div>
        <div className="tr-totals-row">
          <span>
            VAT @ {fmtReceiptNum(data.vatRate, 0)}%
          </span>
          <span>{fmtReceiptNum(data.vatAmount, 2)}</span>
        </div>
        <div className="tr-totals-row tr-totals-row--emphasis">
          <strong>Total</strong>
          <strong>{fmtReceiptNum(data.total, 2)}</strong>
        </div>
        {data.emptiesDeposit !== 0 ? (
          <>
            <div className="tr-totals-row">
              <span>{data.emptiesDeposit > 0 ? "Empties deposit" : "Empties refund"}</span>
              <span>{fmtReceiptNum(data.emptiesDeposit, 2)}</span>
            </div>
            <div className="tr-totals-row tr-totals-row--emphasis">
              <strong>Grand total</strong>
              <strong>{fmtReceiptNum(data.grandTotal, 2)}</strong>
            </div>
          </>
        ) : null}
      </div>

      <hr className="tr-sep" />

      <div className="tr-pay">
        <div className="tr-pay-row">
          <span>Amt paid</span>
          <span>{fmtReceiptNum(data.amountPaid, 2)}</span>
        </div>
        <div className="tr-pay-row">
          <span>Change</span>
          <span>{fmtReceiptNum(data.change, 2)}</span>
        </div>
      </div>

      {data.emptiesReceived.length > 0 ? (
        <>
          <hr className="tr-sep" />
          <p className="tr-subhead">Empties received</p>
          {data.emptiesReceived.map((er, i) => (
            <div key={i} className="tr-empties-row">
              <span>{er.emptiesType}</span>
              <span>{fmtReceiptNum(er.qtyCtn, 0)} ctn</span>
            </div>
          ))}
        </>
      ) : null}

      <hr className="tr-sep" />

      <div className="tr-footer">
        <p>Thank you for doing business with us.</p>
        <p>Goods sold are not returnable.</p>
        <p>We appreciate your patronage.</p>
      </div>
    </div>
  );
}

/**
 * One receipt on screen; Duplicate is in the DOM but hidden until print.
 * Print job: Original, then page break, then Duplicate.
 */
export function ThermalReceiptPrintSlips({ data }: { data: ReceiptPrintData }) {
  return (
    <>
      <ThermalReceiptContent variant="original" data={data} />
      <div className="tr-print-second-slip">
        <ThermalReceiptContent variant="duplicate" data={data} />
      </div>
    </>
  );
}
