"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { getBalanceSheet, getProfitAndLoss, type BalanceSheetResult, type ProfitAndLossResult } from "./actions";

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  initialPl: ProfitAndLossResult;
  initialBs: BalanceSheetResult;
  defaultFrom: string;
  defaultTo: string;
  defaultAsOf: string;
};

export function FinancialStatementsClient({ initialPl, initialBs, defaultFrom, defaultTo, defaultAsOf }: Props) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [asOf, setAsOf] = useState(defaultAsOf);
  const [pl, setPl] = useState<ProfitAndLossResult>(initialPl);
  const [bs, setBs] = useState<BalanceSheetResult>(initialBs);
  const [tab, setTab] = useState<"pl" | "bs">("pl");
  const [isPending, startTransition] = useTransition();

  const refreshPl = useCallback(() => {
    startTransition(async () => {
      const r = await getProfitAndLoss(from, to);
      setPl(r);
    });
  }, [from, to]);

  const refreshBs = useCallback(() => {
    startTransition(async () => {
      const r = await getBalanceSheet(asOf);
      setBs(r);
    });
  }, [asOf]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setTab("pl")}
          className={`rounded-t px-3 py-2 text-sm font-medium ${
            tab === "pl" ? "bg-[var(--navbar)] text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Profit &amp; Loss
        </button>
        <button
          type="button"
          onClick={() => setTab("bs")}
          className={`rounded-t px-3 py-2 text-sm font-medium ${
            tab === "bs" ? "bg-[var(--navbar)] text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Balance Sheet
        </button>
      </div>

      {tab === "pl" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-0.5 block text-xs font-medium text-muted-foreground">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-muted-foreground">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={refreshPl}
              className="h-9 rounded-md border border-input bg-muted/50 px-3 text-sm font-medium hover:bg-muted"
            >
              {isPending ? "Loading…" : "Refresh"}
            </button>
          </div>

          {!pl.ok && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{pl.error}</p>
          )}

          {pl.ok && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium" colSpan={2}>
                      Profit &amp; Loss — {pl.from} to {pl.to}
                    </th>
                  </tr>
                </thead>
                <tbody className="[&_tr]:border-b [&_tr]:border-border/80">
                  <tr>
                    <td className="px-3 py-2">Sales revenue (posted invoices, excl. refunded)</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(pl.revenue)}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground">
                      Cost of goods sold (line qty × product unit cost)
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">({fmtMoney(pl.cogs)})</td>
                  </tr>
                  <tr className="bg-muted/20 font-semibold">
                    <td className="px-3 py-2">Gross profit</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(pl.grossProfit)}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground">Purchase invoices (period)</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(pl.purchaseInvoicesTotal)}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground">VAT on sales (informational)</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(pl.salesTaxTotal)}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground">VAT on purchases (informational)</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(pl.purchaseTaxTotal)}</td>
                  </tr>
                  <tr className="bg-muted/30 font-semibold">
                    <td className="px-3 py-2">Net income (revenue − COGS)</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(pl.netIncome)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                {pl.invoiceCount} posted invoice(s). Operating expenses are not posted from this app; extend with manual journals or
                expense modules when available. COGS assumes <code className="rounded bg-muted px-1">products.cost_price</code> matches
                invoice line <code className="rounded bg-muted px-1">qty</code> units (cartons).
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "bs" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-0.5 block text-xs font-medium text-muted-foreground">As of</label>
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={refreshBs}
              className="h-9 rounded-md border border-input bg-muted/50 px-3 text-sm font-medium hover:bg-muted"
            >
              {isPending ? "Loading…" : "Refresh"}
            </button>
          </div>

          {!bs.ok && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{bs.error}</p>
          )}

          {bs.ok && (
            <div className="grid gap-6 lg:grid-cols-3">
              <section className="rounded-lg border border-border">
                <h2 className="border-b border-border bg-muted/30 px-3 py-2 text-sm font-semibold">Assets</h2>
                <ul className="divide-y divide-border">
                  {bs.assets.map((row, i) => (
                    <li key={i} className="flex justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 text-muted-foreground">{row.label}</span>
                      <span className="shrink-0 tabular-nums font-medium">{fmtMoney(row.amount)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-2 bg-muted/20 px-3 py-2 text-sm font-semibold">
                    <span>Total assets</span>
                    <span className="tabular-nums">{fmtMoney(bs.totalAssets)}</span>
                  </li>
                </ul>
              </section>
              <section className="rounded-lg border border-border">
                <h2 className="border-b border-border bg-muted/30 px-3 py-2 text-sm font-semibold">Liabilities</h2>
                <ul className="divide-y divide-border">
                  {bs.liabilities.map((row, i) => (
                    <li key={i} className="flex justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 text-muted-foreground">{row.label}</span>
                      <span className="shrink-0 tabular-nums font-medium">{fmtMoney(row.amount)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-2 bg-muted/20 px-3 py-2 text-sm font-semibold">
                    <span>Total liabilities</span>
                    <span className="tabular-nums">{fmtMoney(bs.totalLiabilities)}</span>
                  </li>
                </ul>
              </section>
              <section className="rounded-lg border border-border">
                <h2 className="border-b border-border bg-muted/30 px-3 py-2 text-sm font-semibold">Equity</h2>
                <ul className="divide-y divide-border">
                  {bs.equity.map((row, i) => (
                    <li key={i} className="flex justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 text-muted-foreground">{row.label}</span>
                      <span className="shrink-0 tabular-nums font-medium">{fmtMoney(row.amount)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-2 bg-muted/20 px-3 py-2 text-sm font-semibold">
                    <span>Total equity</span>
                    <span className="tabular-nums">{fmtMoney(bs.totalEquity)}</span>
                  </li>
                </ul>
              </section>
            </div>
          )}

          {bs.ok && (
            <p className="text-xs text-muted-foreground">
              Balance sheet check: assets − liabilities − equity = {fmtMoney(bs.check)} (should be 0). Cash is estimated from
              payment activity only (no opening bank balance). Read footnotes per line where shown.
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        <Link href="/dashboard/accounting" className="text-[var(--navbar)] underline">
          Accounting overview
        </Link>
        {" · "}
        Subledger-based statements — not a substitute for audited statutory accounts without opening balances and full GL posting.
      </p>
    </div>
  );
}
