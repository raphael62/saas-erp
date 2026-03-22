"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Mail, Printer, RefreshCcw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  getCustomerStatement,
  getCustomerStatementTransactions,
} from "@/app/dashboard/sales/customer-statement/actions";

type StatementRow = {
  customer_id: string;
  phone: string;
  pic_name: string;
  cust_code: string;
  customer_name: string;
  opening_balance: number;
  sales_value: number;
  payment: number;
  outstanding: number;
  balance: number;
};

type TxRow = {
  id: string;
  tx_type: "invoice" | "payment";
  tx_date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  edit_path: string;
};

function fmtMoney(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function CustomerStatement({ orgName }: { orgName?: string }) {
  const [fromDate, setFromDate] = useState(firstDayOfMonthIso());
  const [toDate, setToDate] = useState(todayIso());
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentsMissing, setPaymentsMissing] = useState(false);

  const [showTx, setShowTx] = useState(false);
  const [txRows, setTxRows] = useState<TxRow[]>([]);
  const [txOpening, setTxOpening] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txPaymentsMissing, setTxPaymentsMissing] = useState(false);
  const [txCustomer, setTxCustomer] = useState<StatementRow | null>(null);

  async function loadStatement() {
    setLoading(true);
    setError(null);
    const res = await getCustomerStatement(fromDate, toDate);
    if ("error" in res) {
      setError(res.error ?? "Unknown error");
      setRows([]);
      setPaymentsMissing(false);
      setLoading(false);
      return;
    }
    setRows(res.rows);
    setPaymentsMissing(Boolean(res.payments_missing));
    setLoading(false);
  }

  useEffect(() => {
    void loadStatement();
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.opening_balance += Number(row.opening_balance ?? 0);
        acc.sales_value += Number(row.sales_value ?? 0);
        acc.payment += Number(row.payment ?? 0);
        acc.outstanding += Number(row.outstanding ?? 0);
        acc.balance += Number(row.balance ?? 0);
        return acc;
      },
      { opening_balance: 0, sales_value: 0, payment: 0, outstanding: 0, balance: 0 }
    );
  }, [rows]);

  const txTotals = useMemo(() => {
    return txRows.reduce(
      (acc, row) => {
        acc.debit += Number(row.debit ?? 0);
        acc.credit += Number(row.credit ?? 0);
        return acc;
      },
      { debit: 0, credit: 0 }
    );
  }, [txRows]);

  async function openTransactions(row: StatementRow) {
    setTxCustomer(row);
    setShowTx(true);
    setTxRows([]);
    setTxOpening(0);
    setTxError(null);
    setTxLoading(true);

    const res = await getCustomerStatementTransactions(row.customer_id, fromDate, toDate);
    if ("error" in res) {
      setTxError(res.error ?? "Unknown error");
      setTxLoading(false);
      return;
    }
    setTxOpening(res.opening);
    setTxRows(res.rows);
    setTxPaymentsMissing(Boolean(res.payments_missing));
    setTxLoading(false);
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">Customer Statement</h1>
        <p className="text-sm text-muted-foreground">
          {orgName ? `${orgName} · ` : ""}Sales and payment ledger by customer.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled>
          Search (F3)
        </Button>
        <Button size="sm" variant="outline" disabled>
          Option
        </Button>
        <Button size="sm" variant="outline" disabled>
          Help
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="h-8 rounded border border-input bg-background px-2 text-sm"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="h-8 rounded border border-input bg-background px-2 text-sm"
        />
        <Button
          size="sm"
          style={{ backgroundColor: "var(--navbar)" }}
          className="text-white"
          onClick={() => void loadStatement()}
          disabled={loading}
        >
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {paymentsMissing && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Customer payments table is missing. Run <code>supabase/ADD_CUSTOMER_PAYMENTS.sql</code> to include payment rows.
        </p>
      )}
      {error && <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="max-h-[calc(100vh-16rem)] overflow-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-12 border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                SEQ
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                PHONE
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                PIC NAME
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                CUSTCODE
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                CUSTOMER NAME
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-right font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                OPENING BALANCE
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-right font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                SALES VALUE
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-right font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                PAYMENT
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-right font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                OUTSTANDING
              </th>
              <th className="border-b border-border px-2 py-2 text-right font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                BALANCE
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {loading ? "Loading..." : "No statement rows found."}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={row.customer_id}
                  className={`cursor-pointer border-b border-border last:border-0 ${
                    idx % 2 === 0 ? "bg-background hover:bg-muted/20" : "bg-muted/30 hover:bg-muted/50"
                  }`}
                  onClick={() => void openTransactions(row)}
                >
                  <td className="border-r border-border px-2 py-1.5 text-xs">{idx + 1}</td>
                  <td className="border-r border-border px-2 py-1.5">{row.phone || "—"}</td>
                  <td className="border-r border-border px-2 py-1.5">{row.pic_name || "—"}</td>
                  <td className="border-r border-border px-2 py-1.5">{row.cust_code || "—"}</td>
                  <td className="border-r border-border px-2 py-1.5 font-medium text-[var(--navbar)]">{row.customer_name}</td>
                  <td className="border-r border-border px-2 py-1.5 text-right">{fmtMoney(row.opening_balance)}</td>
                  <td className="border-r border-border px-2 py-1.5 text-right">{fmtMoney(row.sales_value)}</td>
                  <td className="border-r border-border px-2 py-1.5 text-right">{fmtMoney(row.payment)}</td>
                  <td className="border-r border-border px-2 py-1.5 text-right">{fmtMoney(row.outstanding)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{fmtMoney(row.balance)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-emerald-50 font-semibold">
              <td className="border-t border-r border-border px-2 py-1.5 text-xs">#</td>
              <td className="border-t border-r border-border px-2 py-1.5" colSpan={4}>
                TOTALS
              </td>
              <td className="border-t border-r border-border px-2 py-1.5 text-right">{fmtMoney(totals.opening_balance)}</td>
              <td className="border-t border-r border-border px-2 py-1.5 text-right">{fmtMoney(totals.sales_value)}</td>
              <td className="border-t border-r border-border px-2 py-1.5 text-right">{fmtMoney(totals.payment)}</td>
              <td className="border-t border-r border-border px-2 py-1.5 text-right">{fmtMoney(totals.outstanding)}</td>
              <td className="border-t border-border px-2 py-1.5 text-right">{fmtMoney(totals.balance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <Dialog
        open={showTx}
        onOpenChange={setShowTx}
        title={`${txCustomer?.cust_code || ""} — ${txCustomer?.customer_name || "Customer"}`}
        subtitle={`${fromDate} - ${toDate} · Opening: GH₵ ${fmtMoney(txOpening)}`}
        showGearIcon={false}
        contentClassName="max-w-[1140px] text-sm"
        bodyClassName="max-h-[78vh] overflow-auto p-3"
      >
        <div className="space-y-2">
          <p className="rounded bg-slate-100 px-3 py-1.5 text-sm text-slate-700">
            Click an invoice or payment reference to open it for editing.
          </p>
          {txPaymentsMissing && (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
              Payment entries are unavailable until <code>customer_payments</code> table is created.
            </p>
          )}
          {txError && <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive">{txError}</p>}

          <div className="overflow-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="w-12 border-b border-r border-border px-2 py-1.5 text-left text-xs font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    #
                  </th>
                  <th className="w-14 border-b border-r border-border px-2 py-1.5 text-center text-xs font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    TYPE
                  </th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-left text-xs font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    DATE
                  </th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-left text-xs font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    REFERENCE
                  </th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-left text-xs font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    DESCRIPTION
                  </th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-right text-xs font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    DEBIT (SALES)
                  </th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-right text-xs font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    CREDIT
                  </th>
                  <th className="border-b border-border px-2 py-1.5 text-right text-xs font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    BALANCE
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-amber-50">
                  <td className="border-b border-r border-border px-2 py-1.5 text-xs text-muted-foreground">#</td>
                  <td className="border-b border-r border-border px-2 py-1.5" />
                  <td className="border-b border-r border-border px-2 py-1.5" />
                  <td className="border-b border-r border-border px-2 py-1.5" />
                  <td className="border-b border-r border-border px-2 py-1.5 italic font-medium">Beginning Balance</td>
                  <td className="border-b border-r border-border px-2 py-1.5 text-right">0.00</td>
                  <td className="border-b border-r border-border px-2 py-1.5 text-right">0.00</td>
                  <td className={`border-b border-border px-2 py-1.5 text-right font-semibold ${txOpening < 0 ? "text-destructive" : ""}`}>
                    {fmtMoney(txOpening)}
                  </td>
                </tr>

                {txRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                    <td className="border-b border-r border-border px-2 py-1.5 text-xs">{idx + 1}</td>
                    <td className="border-b border-r border-border px-2 py-1.5 text-center">
                      {row.tx_type === "invoice" ? (
                        <FileText className="mx-auto h-3.5 w-3.5 text-blue-600" />
                      ) : (
                        <Wallet className="mx-auto h-3.5 w-3.5 text-emerald-600" />
                      )}
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
                    <td className="border-b border-r border-border px-2 py-1.5 text-right text-blue-700">
                      {row.debit ? fmtMoney(row.debit) : ""}
                    </td>
                    <td className="border-b border-r border-border px-2 py-1.5 text-right text-emerald-700">
                      {row.credit ? fmtMoney(row.credit) : ""}
                    </td>
                    <td className={`border-b border-border px-2 py-1.5 text-right font-semibold ${row.balance < 0 ? "text-destructive" : ""}`}>
                      {fmtMoney(row.balance)}
                    </td>
                  </tr>
                ))}

                {txRows.length === 0 && !txLoading && !txError && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No transactions found for this customer.
                    </td>
                  </tr>
                )}
                {txLoading && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Loading transactions...
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-emerald-50 font-semibold">
                  <td className="border-t border-r border-border px-2 py-1.5 text-xs">#</td>
                  <td className="border-t border-r border-border px-2 py-1.5" colSpan={4}>
                    TOTALS
                  </td>
                  <td className="border-t border-r border-border px-2 py-1.5 text-right text-blue-700">
                    {fmtMoney(txTotals.debit)}
                  </td>
                  <td className="border-t border-r border-border px-2 py-1.5 text-right text-emerald-700">
                    {fmtMoney(txTotals.credit)}
                  </td>
                  <td
                    className={`border-t border-border px-2 py-1.5 text-right ${
                      (txRows[txRows.length - 1]?.balance ?? txOpening) < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {fmtMoney(txRows[txRows.length - 1]?.balance ?? txOpening)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled>
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button size="sm" variant="outline" disabled>
                <Mail className="h-4 w-4" />
                Email
              </Button>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{txRows.length} transactions</span>
              <Button size="sm" variant="outline" onClick={() => setShowTx(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
