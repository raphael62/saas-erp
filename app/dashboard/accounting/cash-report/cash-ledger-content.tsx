"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ExternalLink, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CashTransactionsResult, CashTxRow } from "./actions";

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type LedgerBodyRow =
  | { rowKind: "beginning"; balance: number; dr: number; cr: number }
  | { rowKind: "tx"; seq: number; row: CashTxRow; balance: number }
  | { rowKind: "monthSubtotal"; label: string; dr: number; cr: number; balance: number }
  | { rowKind: "periodTotal"; dr: number; cr: number; balance: number };

export function buildLedgerRows(rows: CashTxRow[], beginning: number): LedgerBodyRow[] {
  const out: LedgerBodyRow[] = [];
  const openingDr = beginning >= 0 ? beginning : 0;
  const openingCr = beginning < 0 ? -beginning : 0;
  out.push({ rowKind: "beginning", balance: beginning, dr: openingDr, cr: openingCr });

  if (rows.length === 0) {
    out.push({
      rowKind: "periodTotal",
      dr: 0,
      cr: 0,
      balance: beginning,
    });
    return out;
  }

  let balance = beginning;
  let currentYm = "";
  let monthDr = 0;
  let monthCr = 0;
  let seq = 1;

  const flushMonth = (ym: string) => {
    out.push({
      rowKind: "monthSubtotal",
      label: `${ym} Sub Total`,
      dr: monthDr,
      cr: monthCr,
      balance,
    });
    monthDr = 0;
    monthCr = 0;
  };

  for (const row of rows) {
    const ym = row.date.slice(0, 7);
    if (currentYm !== "" && ym !== currentYm) {
      flushMonth(currentYm);
    }
    currentYm = ym;

    balance = balance + row.increase - row.decrease;
    monthDr += row.increase;
    monthCr += row.decrease;
    out.push({ rowKind: "tx", seq, row, balance });
    seq += 1;
  }

  if (currentYm !== "") {
    flushMonth(currentYm);
  }

  const periodDr = rows.reduce((s, r) => s + r.increase, 0);
  const periodCr = rows.reduce((s, r) => s + r.decrease, 0);
  out.push({
    rowKind: "periodTotal",
    dr: periodDr,
    cr: periodCr,
    balance,
  });

  return out;
}

export function CashLedgerContent({
  orgName,
  result,
  from,
  to,
  layout,
  backHref,
  fullPageHref,
  /** When set (e.g. cash report modal), Date-No. opens edit in an overlay instead of navigating away. */
  openEditInOverlay,
}: {
  orgName: string;
  result: CashTransactionsResult;
  from: string;
  to: string;
  layout: "page" | "embedded";
  backHref?: string;
  fullPageHref?: string;
  openEditInOverlay?: (pathnameAndSearch: string) => void;
}) {
  const ledgerRows = useMemo(
    () => (result.ok === true ? buildLedgerRows(result.rows, result.beginningBalance) : []),
    [result]
  );

  const printedAt = useMemo(() => new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }), []);

  if (result.ok === false) {
    return (
      <div className="space-y-4">
        {layout === "page" && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-semibold">Cash account ledger</h1>
            {backHref && (
              <Link href={backHref} className="text-sm text-[var(--navbar)] underline">
                ← Back to Cash Report
              </Link>
            )}
          </div>
        )}
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{result.error}</p>
      </div>
    );
  }

  const breadcrumb = `${orgName} / ${result.coaGroupLabel} / ${result.paymentAccountName}`;

  return (
    <div className="cash-ledger-print space-y-4">
      {layout === "page" ? (
        <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-xl font-semibold">Cash account ledger</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{breadcrumb}</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">{result.paymentAccountLabel}</p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {from} ~ {to}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-[var(--navbar)] bg-[var(--navbar)] text-[var(--navbar-foreground)] shadow-sm hover:opacity-90"
              onClick={() => window.print()}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Print
            </Button>
            {backHref && (
              <Link href={backHref} className="text-sm text-[var(--navbar)] underline">
                ← Back to Cash Report
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2 print:hidden">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm text-muted-foreground">{breadcrumb}</p>
            <p className="text-sm font-medium text-foreground">{result.paymentAccountLabel}</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {from} ~ {to}
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-[var(--navbar)] bg-[var(--navbar)] text-[var(--navbar-foreground)] shadow-sm hover:opacity-90"
              onClick={() => window.print()}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Print
            </Button>
            {fullPageHref && (
              <Link href={fullPageHref} className="text-sm text-[var(--navbar)] underline">
                Full page
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="hidden print:block">
        <h1 className="text-center text-lg font-semibold">Cash account ledger</h1>
        <p className="mt-1 text-center text-sm">{breadcrumb}</p>
        <p className="mt-1 text-center text-sm tabular-nums text-muted-foreground">
          {from} ~ {to}
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-background">
        <table className="w-full min-w-[1040px] border-collapse text-xs">
          <thead>
            <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
              <th className="border border-border px-1.5 py-1.5 text-center font-medium">Seq</th>
              <th className="border border-border px-1.5 py-1.5 text-left font-medium">Transaction type</th>
              <th className="border border-border px-1.5 py-1.5 text-left font-medium">Date-No.</th>
              <th className="border border-border px-1.5 py-1.5 text-left font-medium tabular-nums">Transact date</th>
              <th className="border border-border px-1.5 py-1.5 text-left font-medium tabular-nums">Bank date</th>
              <th className="border border-border px-1.5 py-1.5 text-left font-medium">Code</th>
              <th className="border border-border px-1.5 py-1.5 text-left font-medium">Name</th>
              <th className="border border-border px-1.5 py-1.5 text-left font-medium">Cheque no. / Details</th>
              <th className="border border-border px-1.5 py-1.5 text-right font-medium tabular-nums">Dr. amount</th>
              <th className="border border-border px-1.5 py-1.5 text-right font-medium tabular-nums">Cr. amount</th>
              <th className="border border-border px-1.5 py-1.5 text-right font-medium tabular-nums">Balance</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 && result.beginningBalance === 0 ? (
              <tr>
                <td colSpan={11} className="border border-border px-3 py-8 text-center text-muted-foreground">
                  No movements in this period for this account.
                </td>
              </tr>
            ) : (
              ledgerRows.map((lr, idx) => {
                if (lr.rowKind === "beginning") {
                  return (
                    <tr key="beginning" className="bg-muted/15 font-medium">
                      <td className="border border-border px-1.5 py-1 text-center text-muted-foreground">—</td>
                      <td className="border border-border px-1.5 py-1 text-muted-foreground">—</td>
                      <td className="border border-border px-1.5 py-1 text-muted-foreground">—</td>
                      <td className="border border-border px-1.5 py-1 text-muted-foreground">—</td>
                      <td className="border border-border px-1.5 py-1 text-muted-foreground">—</td>
                      <td className="border border-border px-1.5 py-1 text-muted-foreground">—</td>
                      <td className="border border-border px-1.5 py-1">Beginning</td>
                      <td className="border border-border px-1.5 py-1 text-muted-foreground">—</td>
                      <td className="border border-border px-1.5 py-1 text-right tabular-nums">
                        {lr.dr > 0 ? fmtMoney(lr.dr) : "—"}
                      </td>
                      <td className="border border-border px-1.5 py-1 text-right tabular-nums">
                        {lr.cr > 0 ? fmtMoney(lr.cr) : "—"}
                      </td>
                      <td className="border border-border px-1.5 py-1 text-right tabular-nums">{fmtMoney(lr.balance)}</td>
                    </tr>
                  );
                }
                if (lr.rowKind === "tx") {
                  const r = lr.row;
                  return (
                    <tr key={`${r.kind}-${r.id}-${idx}`} className="hover:bg-muted/20">
                      <td className="border border-border px-1.5 py-1 text-center tabular-nums">{lr.seq}</td>
                      <td className="border border-border px-1.5 py-1">{r.txnTypeLabel}</td>
                      <td className="border border-border px-1.5 py-1 tabular-nums">
                        {openEditInOverlay ? (
                          <a
                            href={r.editHref}
                            className="inline-flex items-center gap-1 text-[var(--navbar)] underline underline-offset-2 hover:opacity-80"
                            aria-label={`Edit ${r.txnTypeLabel}: ${r.date} ${r.docNo}`}
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                              if (e.button !== 0) return;
                              e.preventDefault();
                              e.stopPropagation();
                              openEditInOverlay(r.editHref);
                            }}
                          >
                            {r.date} - {r.docNo}
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                          </a>
                        ) : (
                          <Link
                            href={r.editHref}
                            className="inline-flex items-center gap-1 text-[var(--navbar)] underline underline-offset-2 hover:opacity-80"
                            aria-label={`Edit ${r.txnTypeLabel}: ${r.date} ${r.docNo}`}
                          >
                            {r.date} - {r.docNo}
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                          </Link>
                        )}
                      </td>
                      <td className="border border-border px-1.5 py-1 tabular-nums">{r.date}</td>
                      <td className="border border-border px-1.5 py-1 tabular-nums">{r.bankDate || "—"}</td>
                      <td className="border border-border px-1.5 py-1 tabular-nums">{r.counterpartyCode || "—"}</td>
                      <td className="border border-border px-1.5 py-1">{r.counterpartyName || "—"}</td>
                      <td className="border border-border px-1.5 py-1">{r.details || "—"}</td>
                      <td className="border border-border px-1.5 py-1 text-right tabular-nums">
                        {r.increase > 0 ? fmtMoney(r.increase) : "—"}
                      </td>
                      <td className="border border-border px-1.5 py-1 text-right tabular-nums">
                        {r.decrease > 0 ? fmtMoney(r.decrease) : "—"}
                      </td>
                      <td className="border border-border px-1.5 py-1 text-right tabular-nums">{fmtMoney(lr.balance)}</td>
                    </tr>
                  );
                }
                if (lr.rowKind === "monthSubtotal") {
                  return (
                    <tr key={`sub-${lr.label}-${idx}`} className="bg-muted/25 font-semibold">
                      <td className="border border-border px-1.5 py-1" colSpan={7}>
                        {lr.label}
                      </td>
                      <td className="border border-border px-1.5 py-1 text-muted-foreground">—</td>
                      <td className="border border-border px-1.5 py-1 text-right tabular-nums">{fmtMoney(lr.dr)}</td>
                      <td className="border border-border px-1.5 py-1 text-right tabular-nums">{fmtMoney(lr.cr)}</td>
                      <td className="border border-border px-1.5 py-1 text-right tabular-nums">{fmtMoney(lr.balance)}</td>
                    </tr>
                  );
                }
                return (
                  <tr key="total" className="bg-muted/35 font-bold">
                    <td className="border border-border px-1.5 py-1" colSpan={7}>
                      Total
                    </td>
                    <td className="border border-border px-1.5 py-1 text-muted-foreground">—</td>
                    <td className="border border-border px-1.5 py-1 text-right tabular-nums">{fmtMoney(lr.dr)}</td>
                    <td className="border border-border px-1.5 py-1 text-right tabular-nums">{fmtMoney(lr.cr)}</td>
                    <td className="border border-border px-1.5 py-1 text-right tabular-nums">{fmtMoney(lr.balance)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground print:mt-2">
        <p className="max-w-xl print:hidden">
          Click <span className="font-medium text-foreground">Date-No.</span> to open the source document (customer payment,
          supplier payment, or bank transfer) for editing
          {openEditInOverlay ? " in a panel above this ledger" : ""}. Use Ctrl/Cmd-click to open in a new tab.
        </p>
        <p className="ml-auto tabular-nums">{printedAt}</p>
      </div>
    </div>
  );
}
