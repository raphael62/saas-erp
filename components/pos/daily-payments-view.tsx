"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  getDailyPosPaymentsByAccount,
  type DailyPaymentAccountRow,
} from "@/app/dashboard/pos/actions";

function fmtMoney(value: number) {
  return (Number.isFinite(value) ? value : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type Location = { id: string; code?: string | null; name: string };

export function DailyPaymentsView({
  locations = [],
}: {
  locations?: Location[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [locationId, setLocationId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [accounts, setAccounts] = useState<DailyPaymentAccountRow[]>([]);
  const [totalCollected, setTotalCollected] = useState(0);
  const [totalReceipts, setTotalReceipts] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drillRow, setDrillRow] = useState<DailyPaymentAccountRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDailyPosPaymentsByAccount(
        date,
        locationId || undefined,
        search || undefined
      );
      if (res.error) setError(res.error);
      else {
        setAccounts(res.accounts ?? []);
        setTotalCollected(res.totalCollected ?? 0);
        setTotalReceipts(res.totalReceipts ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [date, locationId, search]);

  useEffect(() => {
    load();
  }, [load]);

  const accountCount = accounts.length;
  const totalBalance = 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-0.5 block text-sm font-medium">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 w-full min-w-[10rem] rounded border border-input bg-background px-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-sm font-medium">Location</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="h-8 min-w-[10rem] rounded border border-input bg-background px-2.5 text-sm"
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.code ? `${loc.code} - ${loc.name}` : loc.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-sm font-medium">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search account name or code..."
            className="h-8 min-w-[14rem] rounded border border-input bg-background px-2.5 text-sm"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => {
            const csv = [
              ["#", "CODE", "ACCOUNT NAME", "TYPE", "HEAD", "BALANCE (GHS)", "DAY TOTAL (GHS)", "TXN COUNT"],
              ...accounts.map((a, i) => [
                i + 1,
                a.code,
                a.accountName,
                a.type,
                a.head,
                fmtMoney(a.balance),
                fmtMoney(a.dayTotal),
                a.txnCount,
              ]),
              ["", "", "", "", "", fmtMoney(totalBalance), fmtMoney(totalCollected), totalReceipts],
            ]
              .map((r) => r.join(","))
              .join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `daily-payments-${date}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <FileSpreadsheet className="mr-1.5 h-4 w-4" />
          Export Excel
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="max-w-4xl">
        <div className="grid grid-cols-2 gap-2 rounded border border-slate-300 bg-slate-100 p-2 dark:border-slate-600 dark:bg-slate-800/60 sm:grid-cols-4">
          <div className="rounded border-2 border-blue-500 bg-blue-500/15 px-3 py-2 dark:border-blue-400 dark:bg-blue-500/25">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-200">Accounts</p>
            <p className="text-sm font-bold tabular-nums text-blue-900 dark:text-blue-100">{accountCount}</p>
          </div>
          <div className="rounded border-2 border-emerald-600 bg-emerald-600/15 px-3 py-2 dark:border-emerald-500 dark:bg-emerald-500/25">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">Total Collected</p>
            <p className="text-sm font-bold tabular-nums text-emerald-800 dark:text-emerald-100">
              GH₵ {fmtMoney(totalCollected)}
            </p>
          </div>
          <div className="rounded border-2 border-amber-600 bg-amber-500/15 px-3 py-2 dark:border-amber-500 dark:bg-amber-500/25">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">Receipts</p>
            <p className="text-sm font-bold tabular-nums text-amber-800 dark:text-amber-100">
              {totalReceipts}
            </p>
          </div>
          <div className="rounded border-2 border-violet-600 bg-violet-600/15 px-3 py-2 dark:border-violet-500 dark:bg-violet-500/25">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">Total Balance</p>
            <p className="text-sm font-bold tabular-nums text-violet-800 dark:text-violet-100">GH₵ {fmtMoney(totalBalance)}</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl overflow-hidden rounded border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm table-fixed">
            <thead>
              <tr
                style={{
                  backgroundColor: "color-mix(in oklch, var(--navbar) 12%, white)",
                }}
              >
                <th className="w-10 shrink-0 border-b border-r border-border px-2 py-2 text-left font-medium">#</th>
                <th className="w-14 shrink-0 border-b border-r border-border px-2 py-2 text-left font-medium">CODE</th>
                <th className="w-[7rem] border-b border-r border-border px-2 py-2 text-left font-medium">
                  ACCOUNT NAME
                </th>
                <th className="w-16 shrink-0 border-b border-r border-border px-2 py-2 text-left font-medium">TYPE</th>
                <th className="w-[5.5rem] border-b border-r border-border px-2 py-2 text-left font-medium">
                  HEAD
                </th>
                <th className="w-24 shrink-0 border-b border-r border-border px-2 py-2 text-right font-medium">
                  BALANCE (GHS)
                </th>
                <th className="w-24 shrink-0 border-b border-r border-border px-2 py-2 text-right font-medium">
                  DAY TOTAL (GHS)
                </th>
                <th className="w-20 shrink-0 border-b border-border px-2 py-2 text-right font-medium">TXN COUNT</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No payments for this date.
                  </td>
                </tr>
              ) : (
                accounts.map((row, idx) => (
                  <tr
                    key={row.accountId ?? `unalloc-${idx}`}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                      row.txnCount > 0 ? "cursor-pointer" : ""
                    } ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                    onClick={() => row.txnCount > 0 && setDrillRow(row)}
                  >
                    <td className="border-b border-r border-border px-2 py-2">{idx + 1}</td>
                    <td className="border-b border-r border-border px-2 py-2">{row.code}</td>
                    <td className="max-w-0 truncate border-b border-r border-border px-2 py-2" title={row.accountName}>
                      {row.accountName}
                    </td>
                    <td className="border-b border-r border-border px-2 py-2">{row.type}</td>
                    <td className="max-w-0 truncate border-b border-r border-border px-2 py-2" title={row.head}>
                      {row.head}
                    </td>
                    <td className="border-b border-r border-border px-2 py-2 text-right tabular-nums">
                      {fmtMoney(row.balance)}
                    </td>
                    <td
                      className={`border-b border-r border-border px-2 py-2 text-right tabular-nums font-semibold ${
                        row.dayTotal > 0 ? "text-emerald-700 dark:text-emerald-400" : ""
                      }`}
                    >
                      {fmtMoney(row.dayTotal)}
                    </td>
                    <td className="border-b border-border px-2 py-2 text-right tabular-nums">
                      {row.txnCount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr
                className="font-semibold"
                style={{
                  backgroundColor: "color-mix(in oklch, var(--navbar) 10%, white)",
                }}
              >
                <td colSpan={5} className="border-r border-border px-2 py-2">
                  TOTALS ({accountCount} ACCOUNTS)
                </td>
                <td className="border-r border-border px-2 py-2 text-right tabular-nums">
                  {fmtMoney(totalBalance)}
                </td>
                <td className="border-r border-border px-2 py-2 text-right tabular-nums">
                  {fmtMoney(totalCollected)}
                </td>
                <td className="border-border px-2 py-2 text-right tabular-nums">
                  {totalReceipts}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <Dialog
        open={drillRow !== null}
        onOpenChange={(open) => !open && setDrillRow(null)}
        title={drillRow ? `${drillRow.accountName} — Transactions` : "Transactions"}
        subtitle={
          drillRow
            ? `${drillRow.txnCount} receipt(s) • GH₵ ${fmtMoney(drillRow.dayTotal)}`
            : undefined
        }
        showGearIcon={false}
        contentClassName="max-w-2xl"
      >
        {drillRow && (
          <div className="space-y-3">
            <div className="max-h-[60vh] overflow-auto rounded border border-border">
              <table className="w-full text-sm">
                <thead
                  className="sticky top-0"
                  style={{
                    backgroundColor: "color-mix(in oklch, var(--navbar) 12%, white)",
                  }}
                >
                  <tr>
                    <th className="border-b border-r border-border px-3 py-2 text-left font-medium">
                      Invoice No
                    </th>
                    <th className="border-b border-r border-border px-3 py-2 text-left font-medium">
                      Customer
                    </th>
                    <th className="border-b border-r border-border px-3 py-2 text-left font-medium">
                      Location
                    </th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {drillRow.transactions.map((t) => (
                    <tr
                      key={t.id}
                      className="hover:bg-muted/30"
                      onClick={() => window.open(`/dashboard/pos/receipts/${t.id}`, "_blank")}
                    >
                      <td className="border-b border-r border-border px-3 py-2 font-medium">
                        {t.invoice_no}
                      </td>
                      <td className="border-b border-r border-border px-3 py-2">
                        {t.customer_name}
                      </td>
                      <td className="border-b border-r border-border px-3 py-2">
                        {t.location_name}
                      </td>
                      <td className="border-b border-border px-3 py-2 text-right tabular-nums">
                        GH₵ {fmtMoney(t.grand_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Click a row to open the receipt.
            </p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
