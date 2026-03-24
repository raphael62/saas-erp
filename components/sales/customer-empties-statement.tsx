"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, Printer, RefreshCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  getCustomerEmptiesStatement,
  getCustomerEmptiesTypeTransactions,
} from "@/app/dashboard/sales/customer-empties-statement/actions";
import { SchemaCacheReloadButton } from "@/components/ui/schema-cache-reload";

type DetailRow = {
  empties_type: string;
  opening_balance: number;
  expected: number;
  sold_out: number;
  received: number;
  balance: number;
};

type SummaryRow = {
  customer_id: string;
  phone: string;
  pic_name: string;
  cust_code: string;
  customer_name: string;
  opening_balance: number;
  expected: number;
  sold_out: number;
  received: number;
  balance: number;
  details: DetailRow[];
};

type TransactionRow = {
  id: string;
  tx_type: "invoice" | "receive";
  tx_date: string;
  reference: string;
  description: string;
  expected: number;
  sold_out: number;
  received: number;
  balance: number;
  edit_path: string;
};

function fmtQty(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfYearIso() {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

export function CustomerEmptiesStatement({ orgName }: { orgName?: string }) {
  const [fromDate, setFromDate] = useState(firstDayOfYearIso());
  const [toDate, setToDate] = useState(todayIso());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [selected, setSelected] = useState<SummaryRow | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txRows, setTxRows] = useState<TransactionRow[]>([]);
  const [txOpening, setTxOpening] = useState(0);

  async function refresh() {
    setLoading(true);
    setError(null);
    const res = await getCustomerEmptiesStatement(fromDate, toDate);
    setLoading(false);
    if (!res?.ok) {
      setRows([]);
      setError(res?.error ?? "Unable to load statement.");
      return;
    }
    setRows(res.rows ?? []);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    let opening = 0;
    let expected = 0;
    let sold = 0;
    let received = 0;
    let balance = 0;
    for (const row of rows) {
      opening += Number(row.opening_balance ?? 0);
      expected += Number(row.expected ?? 0);
      sold += Number(row.sold_out ?? 0);
      received += Number(row.received ?? 0);
      balance += Number(row.balance ?? 0);
    }
    return { opening, expected, sold, received, balance };
  }, [rows]);

  const detailTotals = useMemo(() => {
    if (!selected) return { opening: 0, expected: 0, sold: 0, received: 0, balance: 0 };
    let opening = 0;
    let expected = 0;
    let sold = 0;
    let received = 0;
    let balance = 0;
    for (const row of selected.details) {
      opening += Number(row.opening_balance ?? 0);
      expected += Number(row.expected ?? 0);
      sold += Number(row.sold_out ?? 0);
      received += Number(row.received ?? 0);
      balance += Number(row.balance ?? 0);
    }
    return { opening, expected, sold, received, balance };
  }, [selected]);

  const txTotals = useMemo(() => {
    let expected = 0;
    let sold_out = 0;
    let received = 0;
    for (const row of txRows) {
      expected += Number(row.expected ?? 0);
      sold_out += Number(row.sold_out ?? 0);
      received += Number(row.received ?? 0);
    }
    const balance = txRows.length > 0 ? txRows[txRows.length - 1].balance : txOpening;
    return { expected, sold_out, received, balance };
  }, [txRows, txOpening]);

  async function openTypeTransactions(emptiesType: string) {
    if (!selected) return;
    setActiveType(emptiesType);
    setTxLoading(true);
    setTxError(null);
    const res = await getCustomerEmptiesTypeTransactions(selected.customer_id, emptiesType, fromDate, toDate);
    setTxLoading(false);
    if (!res?.ok) {
      setTxRows([]);
      setTxOpening(0);
      setTxError(res?.error ?? "Unable to load transactions.");
      return;
    }
    setTxOpening(res.opening ?? 0);
    setTxRows(res.rows ?? []);
  }

  return (
    <div className="space-y-2">
      <div>
        <h1 className="text-2xl font-semibold">Customer Empties Stmt</h1>
        <p className="text-sm text-muted-foreground">
          {orgName || "Organization"} &mdash; {fromDate} - {toDate}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-0.5 block text-xs text-muted-foreground">Date From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-muted-foreground">Date To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-sm"
          />
        </div>
        <Button
          size="sm"
          disabled={loading}
          onClick={() => void refresh()}
          style={{ backgroundColor: "#bf1d2d" }}
          className="h-7 text-white"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span className="flex-1">{error}</span>
          <SchemaCacheReloadButton error={error} />
        </div>
      )}

      <div className="max-h-[calc(100vh-14rem)] overflow-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
              <th className="w-12 border-b border-r border-border px-2 py-2 text-left text-xs">SEQ</th>
              <th className="border-b border-r border-border px-2 py-2 text-left">PHONE</th>
              <th className="border-b border-r border-border px-2 py-2 text-left">PIC NAME</th>
              <th className="border-b border-r border-border px-2 py-2 text-left">CUSTCODE</th>
              <th className="border-b border-r border-border px-2 py-2 text-left">CUSTOMER NAME</th>
              <th className="border-b border-r border-border px-2 py-2 text-right">OPENING BALANCE</th>
              <th className="border-b border-r border-border px-2 py-2 text-right">EXPECTED</th>
              <th className="border-b border-r border-border px-2 py-2 text-right text-[#bf1d2d]">SOLD OUT</th>
              <th className="border-b border-r border-border px-2 py-2 text-right">RECEIVED</th>
              <th className="border-b border-border px-2 py-2 text-right">BALANCE</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {loading ? "Loading statement..." : "No customer empties data found for this date range."}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={row.customer_id}
                  className={`cursor-pointer border-b border-border last:border-b-0 ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                  onClick={() => setSelected(row)}
                >
                  <td className="w-12 border-r border-border px-2 py-1.5 text-xs text-muted-foreground">{idx + 1}</td>
                  <td className="border-r border-border px-2 py-1.5">{row.phone || "—"}</td>
                  <td className="border-r border-border px-2 py-1.5">{row.pic_name || "—"}</td>
                  <td className="border-r border-border px-2 py-1.5">{row.cust_code || "—"}</td>
                  <td className="border-r border-border px-2 py-1.5">{row.customer_name}</td>
                  <td className="border-r border-border px-2 py-1.5 text-right">{fmtQty(row.opening_balance)}</td>
                  <td className="border-r border-border px-2 py-1.5 text-right">{fmtQty(row.expected)}</td>
                  <td className="border-r border-border px-2 py-1.5 text-right text-[#bf1d2d]">{fmtQty(row.sold_out)}</td>
                  <td className="border-r border-border px-2 py-1.5 text-right">{fmtQty(row.received)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{fmtQty(row.balance)}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-muted/40 font-semibold">
                <td className="border-t border-r border-border px-2 py-1.5 text-right" colSpan={5}>
                  TOTALS
                </td>
                <td className="border-t border-r border-border px-2 py-1.5 text-right">{fmtQty(totals.opening)}</td>
                <td className="border-t border-r border-border px-2 py-1.5 text-right">{fmtQty(totals.expected)}</td>
                <td className="border-t border-r border-border px-2 py-1.5 text-right text-[#bf1d2d]">{fmtQty(totals.sold)}</td>
                <td className="border-t border-r border-border px-2 py-1.5 text-right">{fmtQty(totals.received)}</td>
                <td className="border-t border-border px-2 py-1.5 text-right">{fmtQty(totals.balance)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(next) => {
          if (!next) {
            setSelected(null);
            setActiveType(null);
          }
        }}
        title={`${selected?.cust_code ? selected.cust_code + " — " : ""}sundry ${selected?.customer_name || ""}`}
        subtitle={`${fromDate} - ${toDate} Empties by Type`}
        showGearIcon={false}
        contentClassName="max-w-[920px]"
        bodyClassName="max-h-[86vh] overflow-y-auto p-2"
      >
        {selected && (
          <div className="space-y-2 text-sm">
            <p className="px-1 text-sm text-muted-foreground">
              Click an empties type to see the transaction details (invoices &amp; receipts) for that type.
            </p>

            <div className="rounded border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <th className="w-12 border-b border-r border-border px-2 py-1.5 text-left text-xs">#</th>
                    <th className="border-b border-r border-border px-2 py-1.5 text-left">EMPTIES TYPE</th>
                    <th className="border-b border-r border-border px-2 py-1.5 text-right">OPENING</th>
                    <th className="border-b border-r border-border px-2 py-1.5 text-right">EXPECTED</th>
                    <th className="border-b border-r border-border px-2 py-1.5 text-right text-[#bf1d2d]">SOLD OUT</th>
                    <th className="border-b border-r border-border px-2 py-1.5 text-right">RECEIVED</th>
                    <th className="border-b border-border px-2 py-1.5 text-right">BALANCE</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.details.map((row, i) => (
                    <tr key={row.empties_type} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      <td className="w-12 border-b border-r border-border px-2 py-1.5 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="border-b border-r border-border px-2 py-1.5">
                        <button
                          type="button"
                          className="text-left text-[var(--navbar)] hover:underline"
                          onClick={() => void openTypeTransactions(row.empties_type)}
                        >
                          {row.empties_type}
                        </button>
                      </td>
                      <td className="border-b border-r border-border px-2 py-1.5 text-right">{fmtQty(row.opening_balance)}</td>
                      <td className="border-b border-r border-border px-2 py-1.5 text-right">{fmtQty(row.expected)}</td>
                      <td className="border-b border-r border-border px-2 py-1.5 text-right text-[#bf1d2d]">{fmtQty(row.sold_out)}</td>
                      <td className="border-b border-r border-border px-2 py-1.5 text-right">{fmtQty(row.received)}</td>
                      <td className="border-b border-border px-2 py-1.5 text-right font-semibold">{fmtQty(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 font-semibold">
                    <td className="border-t border-r border-border px-2 py-1.5 text-right" colSpan={2}>
                      TOTALS
                    </td>
                    <td className="border-t border-r border-border px-2 py-1.5 text-right">{fmtQty(detailTotals.opening)}</td>
                    <td className="border-t border-r border-border px-2 py-1.5 text-right">{fmtQty(detailTotals.expected)}</td>
                    <td className="border-t border-r border-border px-2 py-1.5 text-right text-[#bf1d2d]">{fmtQty(detailTotals.sold)}</td>
                    <td className="border-t border-r border-border px-2 py-1.5 text-right">{fmtQty(detailTotals.received)}</td>
                    <td className="border-t border-border px-2 py-1.5 text-right">{fmtQty(detailTotals.balance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline">
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </Button>
                <Button size="sm" variant="outline">
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </Button>
                <Button size="sm" variant="outline">
                  Excel
                </Button>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{selected.details.length} types</span>
                <Button size="sm" variant="outline" onClick={() => setSelected(null)}>
                  <X className="h-3.5 w-3.5" />
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={Boolean(selected && activeType)}
        onOpenChange={(next) => {
          if (!next) setActiveType(null);
        }}
        title={`${selected?.cust_code ? selected.cust_code + " — " : ""}${selected?.customer_name ?? ""}`}
        subtitle={`${fromDate} ~ ${toDate} · ${activeType ?? ""} · Opening: ${fmtQty(txOpening)} cartons`}
        showGearIcon={false}
        contentClassName="max-w-[980px]"
        bodyClassName="max-h-[86vh] overflow-y-auto p-3"
      >
        <div className="space-y-2">
          <p className="rounded bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">
            Click the reference number to open the invoice or empties receipt for editing in a new tab. Balance = Opening + Expected &minus; Sold Out &minus; Received.
          </p>

          {txError && (
            <div className="flex flex-wrap items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-sm text-destructive">
              <span className="flex-1">{txError}</span>
              <SchemaCacheReloadButton error={txError} />
            </div>
          )}

          <div className="rounded border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                  <th className="w-12 border-b border-r border-border px-2 py-1.5 text-left text-xs">#</th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-left">TYPE</th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-left">DATE</th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-left">REFERENCE</th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-left">DESCRIPTION</th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-right">EXPECTED</th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-right text-[#bf1d2d]">SOLD OUT</th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-right">RECEIVED</th>
                  <th className="border-b border-border px-2 py-1.5 text-right">BALANCE</th>
                </tr>
              </thead>
              <tbody>
                {txLoading ? (
                  <tr>
                    <td colSpan={9} className="px-2 py-4 text-center text-muted-foreground">
                      Loading transactions...
                    </td>
                  </tr>
                ) : (
                  <>
                    <tr className="bg-muted/10 italic">
                      <td className="border-b border-r border-border px-2 py-1.5" />
                      <td className="border-b border-r border-border px-2 py-1.5" />
                      <td className="border-b border-r border-border px-2 py-1.5" />
                      <td className="border-b border-r border-border px-2 py-1.5" />
                      <td className="border-b border-r border-border px-2 py-1.5 font-semibold italic">Beginning Balance</td>
                      <td className="border-b border-r border-border px-2 py-1.5" />
                      <td className="border-b border-r border-border px-2 py-1.5" />
                      <td className="border-b border-r border-border px-2 py-1.5" />
                      <td className="border-b border-border px-2 py-1.5 text-right font-semibold">{fmtQty(txOpening)}</td>
                    </tr>
                    {txRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-2 py-4 text-center text-muted-foreground">
                          No transactions found for this empties type in the selected date range.
                        </td>
                      </tr>
                    ) : (
                      txRows.map((row, i) => (
                        <tr
                          key={row.id}
                          className={`${i % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-muted/40`}
                        >
                          <td className="w-12 border-b border-r border-border px-2 py-1.5 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="border-b border-r border-border px-2 py-1.5">
                            {row.tx_type === "invoice" ? "\uD83D\uDCC4" : "\uD83D\uDCE5"}
                          </td>
                          <td className="border-b border-r border-border px-2 py-1.5">{row.tx_date}</td>
                          <td className="border-b border-r border-border px-2 py-1.5">
                            <button
                              type="button"
                              className="text-[var(--navbar)] hover:underline"
                              onClick={() => window.open(row.edit_path, "_blank", "noopener,noreferrer")}
                            >
                              {row.reference}
                            </button>
                          </td>
                          <td className="border-b border-r border-border px-2 py-1.5">{row.description}</td>
                          <td className="border-b border-r border-border px-2 py-1.5 text-right">{row.expected ? fmtQty(row.expected) : ""}</td>
                          <td className="border-b border-r border-border px-2 py-1.5 text-right text-[#bf1d2d]">{row.sold_out ? fmtQty(row.sold_out) : ""}</td>
                          <td className="border-b border-r border-border px-2 py-1.5 text-right">{row.received ? fmtQty(row.received) : ""}</td>
                          <td className="border-b border-border px-2 py-1.5 text-right font-semibold text-[#bf1d2d]">{fmtQty(row.balance)}</td>
                        </tr>
                      ))
                    )}
                  </>
                )}
              </tbody>
              {!txLoading && txRows.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/40 font-semibold">
                    <td className="border-t border-r border-border px-2 py-1.5 text-right" colSpan={5}>
                      TOTALS
                    </td>
                    <td className="border-t border-r border-border px-2 py-1.5 text-right">{fmtQty(txTotals.expected)}</td>
                    <td className="border-t border-r border-border px-2 py-1.5 text-right text-[#bf1d2d]">{fmtQty(txTotals.sold_out)}</td>
                    <td className="border-t border-r border-border px-2 py-1.5 text-right">{fmtQty(txTotals.received)}</td>
                    <td className="border-t border-border px-2 py-1.5 text-right text-[#bf1d2d]">{fmtQty(txTotals.balance)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline">
                <Printer className="h-3.5 w-3.5" />
                Print
              </Button>
              <Button size="sm" variant="outline">
                <Mail className="h-3.5 w-3.5" />
                Email
              </Button>
              <Button size="sm" variant="outline">
                Excel
              </Button>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{txRows.length} transactions</span>
              <Button size="sm" variant="outline" onClick={() => setActiveType(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
