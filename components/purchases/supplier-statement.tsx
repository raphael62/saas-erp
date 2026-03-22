"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  FileText,
  Mail,
  Package,
  Printer,
  Recycle,
  RefreshCcw,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  getSupplierStatement,
  getSupplierStatementTransactions,
  type SupplierStatementFilter,
  type SupplierTxRow,
} from "@/app/dashboard/purchases/supplier-statement/actions";
import { queueSupplierStatementEditNavigation } from "@/lib/statement-edit-bridge";

/** Match dashboard / globals.css theme (`--navbar`). */
const NAVBAR = "var(--navbar)";
const NAVBAR_FG = "var(--navbar-foreground)";
const HEADER_CELL_BG = "color-mix(in oklch, var(--navbar) 12%, white)";
const FOOTER_CELL_BG = "color-mix(in oklch, var(--navbar) 14%, white)";
const SUBTLE_ROW_BG = "color-mix(in oklch, var(--navbar) 6%, white)";

type StatementRow = {
  supplier_id: string;
  phone: string;
  contact_name: string;
  supplier_code: string;
  supplier_name: string;
  opening_balance: number;
  purchase_value: number;
  pi_empties_value: number;
  payment: number;
  empties_credit: number;
  outstanding: number;
  balance: number;
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

function supplierTitle(row: StatementRow) {
  const code = String(row.supplier_code ?? "").trim();
  const name = String(row.supplier_name ?? "").trim();
  return code ? `${code} - ${name}` : name || "Supplier";
}

/** Tailwind classes for transaction description (light + dark). */
function supplierTxDescriptionClass(row: SupplierTxRow): string {
  switch (row.tx_kind) {
    case "purchase_invoice":
      return "font-medium text-blue-700 dark:text-blue-300";
    case "purchase_invoice_empties":
      return row.description === "Empties Purchase"
        ? "font-medium text-teal-700 dark:text-teal-300"
        : "font-medium text-violet-700 dark:text-violet-300";
    case "empties_dispatch":
      return "font-medium text-amber-800 dark:text-amber-300";
    case "supplier_payment":
      return "font-medium text-emerald-800 dark:text-emerald-300";
    default:
      return "text-foreground";
  }
}

export function SupplierStatement({ orgName }: { orgName?: string }) {
  const router = useRouter();
  const [fromDate, setFromDate] = useState(firstDayOfMonthIso());
  const [toDate, setToDate] = useState(todayIso());
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentsMissing, setPaymentsMissing] = useState(false);
  const [emptiesMissing, setEmptiesMissing] = useState(false);
  const [piMissing, setPiMissing] = useState(false);

  const [showTx, setShowTx] = useState(false);
  const [txRows, setTxRows] = useState<SupplierTxRow[]>([]);
  const [txOpening, setTxOpening] = useState(0);
  const [txClosing, setTxClosing] = useState(0);
  const [txTotalDebit, setTxTotalDebit] = useState(0);
  const [txTotalCredit, setTxTotalCredit] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txPaymentsMissing, setTxPaymentsMissing] = useState(false);
  const [txEmptiesMissing, setTxEmptiesMissing] = useState(false);
  const [txSupplier, setTxSupplier] = useState<StatementRow | null>(null);
  const [txFilter, setTxFilter] = useState<SupplierStatementFilter>("all");

  const loadStatement = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getSupplierStatement(fromDate, toDate);
    if ("error" in res) {
      setError(res.error ?? "Unknown error");
      setRows([]);
      setPaymentsMissing(false);
      setEmptiesMissing(false);
      setPiMissing(false);
      setLoading(false);
      return;
    }
    setRows(res.rows);
    setPaymentsMissing(Boolean(res.payments_missing));
    setEmptiesMissing(Boolean(res.empties_missing));
    setPiMissing(Boolean(res.purchase_invoices_missing));
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => {
    void loadStatement();
  }, [loadStatement]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.opening_balance += Number(row.opening_balance ?? 0);
        acc.purchase_value += Number(row.purchase_value ?? 0);
        acc.pi_empties_value += Number(row.pi_empties_value ?? 0);
        acc.payment += Number(row.payment ?? 0);
        acc.empties_credit += Number(row.empties_credit ?? 0);
        acc.outstanding += Number(row.outstanding ?? 0);
        acc.balance += Number(row.balance ?? 0);
        return acc;
      },
      {
        opening_balance: 0,
        purchase_value: 0,
        pi_empties_value: 0,
        payment: 0,
        empties_credit: 0,
        outstanding: 0,
        balance: 0,
      }
    );
  }, [rows]);

  async function loadTransactions(row: StatementRow, filter: SupplierStatementFilter) {
    setTxSupplier(row);
    setTxFilter(filter);
    setShowTx(true);
    setTxRows([]);
    setTxOpening(0);
    setTxClosing(0);
    setTxTotalDebit(0);
    setTxTotalCredit(0);
    setTxError(null);
    setTxLoading(true);

    const res = await getSupplierStatementTransactions(row.supplier_id, fromDate, toDate, filter);
    if ("error" in res) {
      setTxError(res.error ?? "Unknown error");
      setTxLoading(false);
      return;
    }
    setTxOpening(res.opening);
    setTxRows(res.rows);
    setTxClosing(res.closing_balance);
    setTxTotalDebit(res.total_debit);
    setTxTotalCredit(res.total_credit);
    setTxPaymentsMissing(Boolean(res.payments_missing));
    setTxEmptiesMissing(Boolean(res.empties_missing));
    setTxLoading(false);
  }

  function openTransactions(row: StatementRow) {
    void loadTransactions(row, "all");
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">Supplier Statement</h1>
        <p className="text-sm font-medium" style={{ color: NAVBAR }}>
          {orgName ? `${orgName} · ` : ""}
          {fromDate} ~ {toDate}
        </p>
        <p className="text-sm text-muted-foreground">Purchases, empties credits, and payments by supplier.</p>
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
          style={{ backgroundColor: NAVBAR, color: NAVBAR_FG }}
          className="hover:opacity-90"
          onClick={() => void loadStatement()}
          disabled={loading}
        >
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {(paymentsMissing || emptiesMissing || piMissing) && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {piMissing && (
            <>
              Purchase invoice tables missing. Run <code>supabase/ADD_PURCHASE_INVOICES.sql</code>.{" "}
            </>
          )}
          {paymentsMissing && (
            <>
              Supplier payments missing. Run <code>supabase/ADD_SUPPLIER_PAYMENTS.sql</code>.{" "}
            </>
          )}
          {emptiesMissing && (
            <>
              Empties dispatch missing. Run <code>supabase/ADD_EMPTIES_DISPATCH.sql</code>.
            </>
          )}
        </p>
      )}
      {error && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="max-h-[calc(100vh-16rem)] overflow-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              <th
                className="w-12 border-b border-r border-border px-2 py-2 text-left font-medium"
                style={{ backgroundColor: HEADER_CELL_BG }}
              >
                SEQ
              </th>
              <th
                className="border-b border-r border-border px-2 py-2 text-left font-medium"
                style={{ backgroundColor: HEADER_CELL_BG }}
              >
                PHONE
              </th>
              <th
                className="border-b border-r border-border px-2 py-2 text-left font-medium"
                style={{ backgroundColor: HEADER_CELL_BG }}
              >
                CONTACT
              </th>
              <th
                className="border-b border-r border-border px-2 py-2 text-left font-medium"
                style={{ backgroundColor: HEADER_CELL_BG }}
              >
                SUPPLIERCODE
              </th>
              <th
                className="border-b border-r border-border px-2 py-2 text-left font-medium"
                style={{ backgroundColor: HEADER_CELL_BG }}
              >
                SUPPLIER NAME
              </th>
              <th
                className="border-b border-r border-border px-2 py-2 text-right font-medium"
                style={{ backgroundColor: HEADER_CELL_BG }}
              >
                OPENING BAL.
              </th>
              <th
                className="border-b border-r border-border px-2 py-2 text-right font-medium"
                style={{ backgroundColor: HEADER_CELL_BG }}
              >
                PURCHASE VALUE
              </th>
              <th
                className="border-b border-r border-border px-2 py-2 text-right font-medium"
                style={{ backgroundColor: HEADER_CELL_BG }}
                title="Returnables from purchase invoice lines (ref: empties inv no.)"
              >
                EMPTIES VALUE
              </th>
              <th
                className="border-b border-r border-border px-2 py-2 text-right font-medium"
                style={{ backgroundColor: HEADER_CELL_BG }}
              >
                PAYMENT
              </th>
              <th
                className="border-b border-r border-border px-2 py-2 text-right font-medium"
                style={{ backgroundColor: HEADER_CELL_BG }}
                title="Empties dispatch credit notes"
              >
                DISP. CR.
              </th>
              <th
                className="border-b border-r border-border px-2 py-2 text-right font-medium"
                style={{ backgroundColor: HEADER_CELL_BG }}
              >
                OUTSTANDING
              </th>
              <th
                className="border-b border-border px-2 py-2 text-right font-medium"
                style={{ backgroundColor: HEADER_CELL_BG }}
              >
                BALANCE
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {loading ? "Loading..." : "No statement rows found."}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={row.supplier_id}
                  className={`cursor-pointer border-b border-border last:border-0 ${
                    idx % 2 === 0 ? "bg-background hover:bg-muted/20" : "bg-muted/30 hover:bg-muted/50"
                  }`}
                  onClick={() => void openTransactions(row)}
                >
                  <td className="border-r border-border px-2 py-1.5 text-xs">{idx + 1}</td>
                  <td className="border-r border-border px-2 py-1.5">{row.phone || "—"}</td>
                  <td className="border-r border-border px-2 py-1.5">{row.contact_name || "—"}</td>
                  <td className="border-r border-border px-2 py-1.5">{row.supplier_code || "—"}</td>
                  <td
                    className="border-r border-border px-2 py-1.5 font-medium"
                    style={{ color: NAVBAR }}
                  >
                    {row.supplier_name}
                  </td>
                  <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                    {fmtMoney(row.opening_balance)}
                  </td>
                  <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                    {fmtMoney(row.purchase_value)}
                  </td>
                  <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                    {fmtMoney(row.pi_empties_value)}
                  </td>
                  <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                    {fmtMoney(row.payment)}
                  </td>
                  <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                    {fmtMoney(row.empties_credit)}
                  </td>
                  <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                    {fmtMoney(row.outstanding)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-base font-semibold tabular-nums">
                    {fmtMoney(row.balance)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="font-semibold" style={{ backgroundColor: FOOTER_CELL_BG }}>
              <td className="border-t border-r border-border px-2 py-1.5 text-xs">#</td>
              <td className="border-t border-r border-border px-2 py-1.5" colSpan={4}>
                TOTALS
              </td>
              <td className="border-t border-r border-border px-2 py-1.5 text-right tabular-nums">
                {fmtMoney(totals.opening_balance)}
              </td>
              <td className="border-t border-r border-border px-2 py-1.5 text-right tabular-nums">
                {fmtMoney(totals.purchase_value)}
              </td>
              <td className="border-t border-r border-border px-2 py-1.5 text-right tabular-nums">
                {fmtMoney(totals.pi_empties_value)}
              </td>
              <td className="border-t border-r border-border px-2 py-1.5 text-right tabular-nums">
                {fmtMoney(totals.payment)}
              </td>
              <td className="border-t border-r border-border px-2 py-1.5 text-right tabular-nums">
                {fmtMoney(totals.empties_credit)}
              </td>
              <td className="border-t border-r border-border px-2 py-1.5 text-right tabular-nums">
                {fmtMoney(totals.outstanding)}
              </td>
              <td
                className="border-t border-border px-2 py-1.5 text-right text-base font-bold tabular-nums"
                style={{ color: NAVBAR }}
              >
                {fmtMoney(totals.balance)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <Dialog
        open={showTx}
        onOpenChange={setShowTx}
        title={txSupplier ? supplierTitle(txSupplier) : "Supplier"}
        subtitle={`${fromDate} ~ ${toDate} · Opening: GH₵ ${fmtMoney(txOpening)}`}
        showGearIcon={false}
        contentClassName="max-w-[1180px] text-sm"
        bodyClassName="max-h-[80vh] overflow-auto p-3"
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Click a reference to open that document for editing (same tab).
            </p>
            <div className="inline-flex overflow-hidden rounded-md border border-border text-xs font-medium">
              {(
                [
                  ["all", "All"],
                  ["products", "Products"],
                  ["empties", "Empties"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (txSupplier) void loadTransactions(txSupplier, key);
                  }}
                  className="px-3 py-1.5 transition-colors"
                  style={
                    txFilter === key
                      ? { backgroundColor: NAVBAR, color: NAVBAR_FG }
                      : { backgroundColor: "var(--background)", color: "inherit" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {(txPaymentsMissing || txEmptiesMissing) && (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
              {txPaymentsMissing && <>Some payment lines may be missing.</>}{" "}
              {txEmptiesMissing && <>Empties dispatch table missing.</>}
            </p>
          )}
          {txError && (
            <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
              {txError}
            </p>
          )}

          <div className="overflow-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th
                    className="w-12 border-b border-r border-border px-2 py-1.5 text-left text-xs font-medium"
                    style={{ backgroundColor: HEADER_CELL_BG }}
                  >
                    #
                  </th>
                  <th
                    className="w-14 border-b border-r border-border px-2 py-1.5 text-center text-xs font-medium"
                    style={{ backgroundColor: HEADER_CELL_BG }}
                  >
                    TYPE
                  </th>
                  <th
                    className="border-b border-r border-border px-2 py-1.5 text-left text-xs font-medium"
                    style={{ backgroundColor: HEADER_CELL_BG }}
                  >
                    DATE
                  </th>
                  <th
                    className="border-b border-r border-border px-2 py-1.5 text-left text-xs font-medium"
                    style={{ backgroundColor: HEADER_CELL_BG }}
                  >
                    REFERENCE
                  </th>
                  <th
                    className="border-b border-r border-border px-2 py-1.5 text-left text-xs font-medium"
                    style={{ backgroundColor: HEADER_CELL_BG }}
                  >
                    P.O. NUMBER
                  </th>
                  <th
                    className="border-b border-r border-border px-2 py-1.5 text-left text-xs font-medium"
                    style={{ backgroundColor: HEADER_CELL_BG }}
                  >
                    DESCRIPTION
                  </th>
                  <th
                    className="border-b border-r border-border px-2 py-1.5 text-right text-xs font-medium"
                    style={{ backgroundColor: HEADER_CELL_BG }}
                  >
                    DEBIT (PURCHASES)
                  </th>
                  <th
                    className="border-b border-r border-border px-2 py-1.5 text-right text-xs font-medium"
                    style={{ backgroundColor: HEADER_CELL_BG }}
                  >
                    CREDIT
                  </th>
                  <th
                    className="border-b border-border px-2 py-1.5 text-right text-xs font-medium"
                    style={{ backgroundColor: HEADER_CELL_BG }}
                  >
                    BALANCE
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ backgroundColor: SUBTLE_ROW_BG }}>
                  <td className="border-b border-r border-border px-2 py-1.5 text-xs text-muted-foreground">#</td>
                  <td className="border-b border-r border-border px-2 py-1.5" />
                  <td className="border-b border-r border-border px-2 py-1.5" />
                  <td className="border-b border-r border-border px-2 py-1.5" />
                  <td className="border-b border-r border-border px-2 py-1.5" />
                  <td className="border-b border-r border-border px-2 py-1.5 font-medium italic">
                    Beginning Balance
                  </td>
                  <td className="border-b border-r border-border px-2 py-1.5 text-right tabular-nums">—</td>
                  <td className="border-b border-r border-border px-2 py-1.5 text-right tabular-nums">—</td>
                  <td className="border-b border-border px-2 py-1.5 text-right text-base font-bold tabular-nums">
                    {fmtMoney(txOpening)}
                  </td>
                </tr>

                {txRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                    <td className="border-b border-r border-border px-2 py-1.5 text-xs">{idx + 1}</td>
                    <td className="border-b border-r border-border px-2 py-1.5 text-center">
                      {row.tx_kind === "purchase_invoice" ? (
                        <span title="Purchase Invoice"><FileText className="mx-auto h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /></span>
                      ) : row.tx_kind === "purchase_invoice_empties" ? (
                        row.description === "Empties Purchase" ? (
                          <span title="Empties Purchase"><RefreshCcw className="mx-auto h-3.5 w-3.5 text-teal-600 dark:text-teal-400" /></span>
                        ) : (
                          <span title="Empties Invoice"><Package className="mx-auto h-3.5 w-3.5 text-violet-700 dark:text-violet-400" /></span>
                        )
                      ) : row.tx_kind === "empties_dispatch" ? (
                        <span title="Empties Dispatch"><Recycle className="mx-auto h-3.5 w-3.5 text-amber-700 dark:text-amber-400" /></span>
                      ) : (
                        <span title="Payments"><Wallet className="mx-auto h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" /></span>
                      )}
                    </td>
                    <td className="border-b border-r border-border px-2 py-1.5">{row.tx_date}</td>
                    <td className="border-b border-r border-border px-2 py-1.5">
                      <button
                        type="button"
                        className="hover:underline"
                        style={{ color: NAVBAR }}
                        onClick={() => {
                          setShowTx(false);
                          queueSupplierStatementEditNavigation(row.edit_path);
                          router.push(row.edit_path);
                        }}
                      >
                        {row.reference}
                      </button>
                    </td>
                    <td className="border-b border-r border-border px-2 py-1.5">
                      {row.po_number?.trim() ? row.po_number.trim() : "—"}
                    </td>
                    <td className="border-b border-r border-border px-2 py-1.5">
                      <span className={supplierTxDescriptionClass(row)}>{row.description}</span>
                    </td>
                    <td className="border-b border-r border-border px-2 py-1.5 text-right tabular-nums text-blue-800">
                      {row.debit ? fmtMoney(row.debit) : ""}
                    </td>
                    <td
                      className="border-b border-r border-border px-2 py-1.5 text-right font-medium tabular-nums"
                      style={{ color: NAVBAR }}
                    >
                      {row.credit ? fmtMoney(row.credit) : ""}
                    </td>
                    <td className="border-b border-border px-2 py-1.5 text-right text-base font-bold tabular-nums">
                      {fmtMoney(row.balance)}
                    </td>
                  </tr>
                ))}

                {txRows.length === 0 && !txLoading && !txError && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No transactions in this view.
                    </td>
                  </tr>
                )}
                {txLoading && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Loading transactions...
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="font-bold" style={{ backgroundColor: FOOTER_CELL_BG }}>
                  <td className="border-t border-r border-border px-2 py-1.5 text-xs">#</td>
                  <td className="border-t border-r border-border px-2 py-1.5" colSpan={5} style={{ textAlign: "right" }}>
                    TOTALS
                  </td>
                  <td className="border-t border-r border-border px-2 py-1.5 text-right tabular-nums text-blue-800">
                    {fmtMoney(txTotalDebit)}
                  </td>
                  <td
                    className="border-t border-r border-border px-2 py-1.5 text-right tabular-nums"
                    style={{ color: NAVBAR }}
                  >
                    {fmtMoney(txTotalCredit)}
                  </td>
                  <td
                    className="border-t border-border px-2 py-1.5 text-right text-base tabular-nums"
                    style={{ color: NAVBAR }}
                  >
                    {fmtMoney(txClosing)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled>
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button size="sm" variant="outline" disabled>
                <Mail className="h-4 w-4" />
                Email
              </Button>
              <Button size="sm" variant="outline" disabled>
                <FileSpreadsheet className="h-4 w-4" />
                Excel
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
