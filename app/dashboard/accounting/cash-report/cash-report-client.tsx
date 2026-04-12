"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { HelpCircle, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TransactionEditOverlay } from "@/components/ui/transaction-edit-overlay";
import { CashLedgerContent } from "./cash-ledger-content";
import {
  getCashReport,
  getCashAccountTransactions,
  type CashReportGroup,
  type CashReportResult,
  type CashTransactionsResult,
} from "./actions";

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  orgName: string;
  initialReport: CashReportResult;
  defaultFrom: string;
  defaultTo: string;
};

export function CashReportClient({ orgName, initialReport, defaultFrom, defaultTo }: Props) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [report, setReport] = useState<CashReportResult>(initialReport);
  const [search, setSearch] = useState("");
  const [showZeros, setShowZeros] = useState(true);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerResult, setLedgerResult] = useState<CashTransactionsResult | null>(null);
  const [ledgerSubtitle, setLedgerSubtitle] = useState("");
  const [ledgerPaymentAccountId, setLedgerPaymentAccountId] = useState<string | null>(null);
  /** Path + query for iframe (e.g. /dashboard/sales/customer-payments?edit=…) — stacked above ledger modal */
  const [editOverlayPath, setEditOverlayPath] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F3" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setFilterPanelOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!filterPanelOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const el = filterPanelRef.current;
      if (el && !el.contains(e.target as Node)) setFilterPanelOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [filterPanelOpen]);

  const filteredGroups = useMemo(() => {
    if (report.ok !== true) return [];
    const q = search.trim().toLowerCase();
    let groups = report.groups;
    if (!showZeros) {
      groups = groups
        .map((g) => ({
          ...g,
          accounts: g.accounts.filter(
            (a) =>
              Math.abs(a.beginning) > 0.004 ||
              Math.abs(a.increase) > 0.004 ||
              Math.abs(a.decrease) > 0.004 ||
              Math.abs(a.ending) > 0.004
          ),
        }))
        .filter((g) => g.accounts.length > 0);
    }
    if (!q) return groups;
    return groups
      .map((g) => {
        const gMatch =
          g.groupLabel.toLowerCase().includes(q) ||
          g.accounts.some(
            (a) =>
              a.name.toLowerCase().includes(q) ||
              a.code.toLowerCase().includes(q)
          );
        const accounts = g.accounts.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.code.toLowerCase().includes(q) ||
            g.groupLabel.toLowerCase().includes(q)
        );
        if (gMatch && accounts.length === g.accounts.length) return g;
        if (accounts.length === 0 && !gMatch) return null;
        const acc = accounts.length > 0 ? accounts : g.accounts;
        const subTotal = acc.reduce(
          (agg, row) => ({
            beginning: agg.beginning + row.beginning,
            increase: agg.increase + row.increase,
            decrease: agg.decrease + row.decrease,
            ending: agg.ending + row.ending,
          }),
          { beginning: 0, increase: 0, decrease: 0, ending: 0 }
        );
        return { ...g, accounts: acc, subTotal } as CashReportGroup;
      })
      .filter((x): x is CashReportGroup => x !== null);
  }, [report, search, showZeros]);

  const filteredGrand =
    report.ok === true
      ? filteredGroups.reduce(
          (acc, g) => ({
            beginning: acc.beginning + g.subTotal.beginning,
            increase: acc.increase + g.subTotal.increase,
            decrease: acc.decrease + g.subTotal.decrease,
            ending: acc.ending + g.subTotal.ending,
          }),
          { beginning: 0, increase: 0, decrease: 0, ending: 0 }
        )
      : null;

  const reportRangeFrom = report.ok === true ? report.from : from;
  const reportRangeTo = report.ok === true ? report.to : to;
  const ledgerFullPageBase = `/dashboard/accounting/cash-report/transactions?from=${encodeURIComponent(reportRangeFrom)}&to=${encodeURIComponent(reportRangeTo)}`;

  const refreshLedgerTransactions = useCallback(async () => {
    if (!ledgerPaymentAccountId) return;
    const r = await getCashAccountTransactions(ledgerPaymentAccountId, reportRangeFrom, reportRangeTo);
    setLedgerResult(r);
    if (r.ok === true) {
      setLedgerSubtitle(r.paymentAccountLabel);
    }
  }, [ledgerPaymentAccountId, reportRangeFrom, reportRangeTo]);

  const closeEditOverlay = useCallback(() => {
    setEditOverlayPath(null);
    void refreshLedgerTransactions();
  }, [refreshLedgerTransactions]);

  const openLedger = (paymentAccountId: string, accountName: string) => {
    setEditOverlayPath(null);
    setLedgerPaymentAccountId(paymentAccountId);
    setLedgerSubtitle(accountName);
    setLedgerOpen(true);
    setLedgerLoading(true);
    setLedgerResult(null);
    void (async () => {
      const r = await getCashAccountTransactions(paymentAccountId, reportRangeFrom, reportRangeTo);
      setLedgerResult(r);
      if (r.ok === true) {
        setLedgerSubtitle(r.paymentAccountLabel);
      }
      setLedgerLoading(false);
    })();
  };

  const closeLedger = (open: boolean) => {
    setLedgerOpen(open);
    if (!open) {
      setEditOverlayPath(null);
      setLedgerResult(null);
      setLedgerLoading(false);
      setLedgerSubtitle("");
      setLedgerPaymentAccountId(null);
    }
  };

  const applyFilters = useCallback(() => {
    startTransition(async () => {
      const r = await getCashReport(from, to);
      setReport(r);
      setFilterPanelOpen(false);
    });
  }, [from, to]);

  /** Title on its own line; Search / Help / filter on the next (screen only). Org + date below. */
  const reportHeaderToolbar = (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold text-foreground">Cash Report</h1>
      <div className="print:hidden flex flex-wrap items-end gap-2 border-b border-border pb-2">
        <input
          id="cash-report-search"
          type="search"
          placeholder="Filter accounts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 min-w-[10rem] max-w-[14rem] rounded-md border border-input bg-background px-2.5 text-sm"
        />
        <div className="relative" ref={filterPanelRef}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-[var(--navbar)] bg-[var(--navbar)] text-[var(--navbar-foreground)] shadow-sm hover:opacity-90"
          onClick={() => setFilterPanelOpen((o) => !o)}
          aria-expanded={filterPanelOpen}
          aria-haspopup="dialog"
        >
          <Search className="mr-1.5 h-4 w-4" />
          Search (F3)
        </Button>
        {filterPanelOpen && (
          <div
            className="absolute left-0 top-full z-50 mt-1 w-[min(calc(100vw-2rem),20rem)] rounded-md border border-border bg-background p-3 shadow-lg"
            role="dialog"
            aria-label="Cash report filters"
          >
            <div className="space-y-3 text-sm">
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Date</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm"
                  />
                  <span className="shrink-0 text-muted-foreground">~</span>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm"
                  />
                </div>
              </div>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="cash-report-show-zeros"
                  checked={showZeros}
                  onChange={(e) => setShowZeros(e.target.checked)}
                  className="mt-1 rounded"
                />
                <label htmlFor="cash-report-show-zeros" className="cursor-pointer leading-snug text-foreground">
                  Include accounts with zero movement (all columns zero)
                </label>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                className="w-full bg-[var(--navbar)] text-[var(--navbar-foreground)] hover:opacity-90"
                onClick={applyFilters}
              >
                {isPending ? "Loading…" : "Apply"}
              </Button>
            </div>
          </div>
        )}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-[var(--navbar)] bg-[var(--navbar)] text-[var(--navbar-foreground)] shadow-sm hover:opacity-90"
        asChild
      >
        <Link href="/dashboard/accounting">
          <HelpCircle className="mr-1.5 h-4 w-4" />
          Help
        </Link>
      </Button>
      </div>
      <div className="flex flex-nowrap items-baseline justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-left text-sm text-muted-foreground">{orgName}</p>
        <p className="shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
          {from} ~ {to}
        </p>
      </div>
    </div>
  );

  const footerBar = (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 print:hidden">
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
      <Button type="button" size="sm" variant="outline" disabled className="text-muted-foreground">
        Excel
      </Button>
    </div>
  );

  if (report.ok === false) {
    return (
      <div className="w-full max-w-[760px] space-y-4">
        {reportHeaderToolbar}
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{report.error}</p>
      </div>
    );
  }

  return (
    <div className="cash-report-print w-full max-w-[760px] space-y-3">
      {reportHeaderToolbar}

      <div>
        <div className="overflow-x-auto rounded-md border border-border bg-background">
          <table className="w-full table-fixed border-collapse text-xs">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[24%]" />
              <col className="w-[13.5%]" />
              <col className="w-[13.5%]" />
              <col className="w-[13.5%]" />
              <col className="w-[13.5%]" />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <th className="border border-border px-1.5 py-1.5 text-left text-[0.8125rem] font-medium leading-tight">
                  Account Name
                </th>
                <th className="border border-border px-1.5 py-1.5 text-left text-[0.8125rem] font-medium leading-tight">
                  Customer/Vendor Name
                </th>
                <th className="border border-border px-1.5 py-1.5 text-left text-[0.8125rem] font-medium tabular-nums leading-tight">
                  Beginning
                </th>
                <th className="border border-border px-1.5 py-1.5 text-left text-[0.8125rem] font-medium tabular-nums leading-tight">
                  Increase
                </th>
                <th className="border border-border px-1.5 py-1.5 text-left text-[0.8125rem] font-medium tabular-nums leading-tight">
                  Decrease
                </th>
                <th className="border border-border px-1.5 py-1.5 text-left text-[0.8125rem] font-medium tabular-nums leading-tight">
                  Ending
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((g) => (
                <Fragment key={g.groupKey}>
                  <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 10%, white)" }}>
                    <td className="border border-border px-1.5 py-1 font-semibold leading-tight text-foreground" colSpan={2}>
                      {g.groupLabel}
                    </td>
                    <td className="border border-border px-1 py-1" />
                    <td className="border border-border px-1 py-1" />
                    <td className="border border-border px-1 py-1" />
                    <td className="border border-border px-1 py-1" />
                  </tr>
                  {g.accounts.map((a) => (
                    <tr key={a.paymentAccountId} className="bg-background">
                      <td className="border border-border px-1.5 py-0.5" />
                      <td className="max-w-0 border border-border px-1.5 py-0.5">
                        <button
                          type="button"
                          onClick={() => openLedger(a.paymentAccountId, a.name)}
                          className="block w-full truncate text-left text-[var(--navbar)] underline underline-offset-2 hover:opacity-80"
                          title={a.name}
                        >
                          {a.name}
                        </button>
                      </td>
                      <td className="border border-border px-1 py-0.5 text-right text-[0.8125rem] tabular-nums leading-tight">
                        {fmtMoney(a.beginning)}
                      </td>
                      <td className="border border-border px-1 py-0.5 text-right text-[0.8125rem] tabular-nums leading-tight">
                        {fmtMoney(a.increase)}
                      </td>
                      <td className="border border-border px-1 py-0.5 text-right text-[0.8125rem] tabular-nums leading-tight">
                        {fmtMoney(a.decrease)}
                      </td>
                      <td className="border border-border px-1 py-0.5 text-right text-[0.8125rem] tabular-nums leading-tight">
                        {fmtMoney(a.ending)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 12%, white)" }} className="font-semibold">
                    <td className="border border-border px-1.5 py-1" />
                    <td className="border border-border px-1.5 py-1 leading-tight">
                      Sub Total
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        ({g.groupLabel.replace(/^\[([^\]]+)\].*$/, "$1")})
                      </span>
                    </td>
                    <td className="border border-border px-1 py-1 text-right text-[0.8125rem] tabular-nums leading-tight">
                      {fmtMoney(g.subTotal.beginning)}
                    </td>
                    <td className="border border-border px-1 py-1 text-right text-[0.8125rem] tabular-nums leading-tight">
                      {fmtMoney(g.subTotal.increase)}
                    </td>
                    <td className="border border-border px-1 py-1 text-right text-[0.8125rem] tabular-nums leading-tight">
                      {fmtMoney(g.subTotal.decrease)}
                    </td>
                    <td className="border border-border px-1 py-1 text-right text-[0.8125rem] tabular-nums leading-tight">
                      {fmtMoney(g.subTotal.ending)}
                    </td>
                  </tr>
                </Fragment>
              ))}
              {filteredGroups.length > 0 && filteredGrand && (
                <tr
                  className="font-bold"
                  style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 22%, white)" }}
                >
                  <td className="border border-border px-1.5 py-1.5 leading-tight" colSpan={2}>
                    Grand Total
                  </td>
                  <td className="border border-border px-1 py-1.5 text-right text-[0.8125rem] tabular-nums leading-tight">
                    {fmtMoney(filteredGrand.beginning)}
                  </td>
                  <td className="border border-border px-1 py-1.5 text-right text-[0.8125rem] tabular-nums leading-tight">
                    {fmtMoney(filteredGrand.increase)}
                  </td>
                  <td className="border border-border px-1 py-1.5 text-right text-[0.8125rem] tabular-nums leading-tight">
                    {fmtMoney(filteredGrand.decrease)}
                  </td>
                  <td className="border border-border px-1 py-1.5 text-right text-[0.8125rem] tabular-nums leading-tight">
                    {fmtMoney(filteredGrand.ending)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredGroups.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">No accounts match the current filter.</p>
        )}
      </div>

      {footerBar}

      <Dialog
        open={ledgerOpen}
        onOpenChange={closeLedger}
        title="Cash account ledger"
        subtitle={ledgerSubtitle || undefined}
        showGearIcon={false}
        contentClassName="max-h-[90vh] w-full max-w-[min(96vw,1200px)] -translate-x-1/2 -translate-y-1/2"
        bodyClassName="max-h-[min(75vh,calc(90vh-4rem))] overflow-y-auto p-4"
      >
        {ledgerLoading && <p className="text-sm text-muted-foreground">Loading ledger…</p>}
        {!ledgerLoading && ledgerResult && (
          <CashLedgerContent
            orgName={orgName}
            result={ledgerResult}
            from={reportRangeFrom}
            to={reportRangeTo}
            layout="embedded"
            fullPageHref={
              ledgerPaymentAccountId
                ? `${ledgerFullPageBase}&paymentAccountId=${encodeURIComponent(ledgerPaymentAccountId)}`
                : undefined
            }
            openEditInOverlay={(path) => setEditOverlayPath(path)}
          />
        )}
      </Dialog>

      <TransactionEditOverlay path={editOverlayPath} onClose={closeEditOverlay} />
    </div>
  );
}
