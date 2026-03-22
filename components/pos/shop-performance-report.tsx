"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  FileUp,
  Send,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getPosPerformance,
  type RepPerformance,
  type PerformanceSummary,
} from "@/app/dashboard/pos/actions-performance";
import { dailyTargetFromMonthly } from "@/lib/month-working-days";

const CURRENCY = "GH₵";

function fmtMoney(value: number) {
  return `${CURRENCY} ${(Number.isFinite(value) ? value : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtPct(value: number) {
  return `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`;
}

type Rep = { id: string; code?: string | null; name: string };

function looksSSR(rep: Rep) {
  return true;
}

function DailySalesChart({
  month,
  salesByDay,
  dailyTarget,
  fmtMoney,
}: {
  month: string;
  salesByDay: Record<string, number>;
  dailyTarget: number;
  fmtMoney: (v: number) => string;
}) {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const days: { date: string; label: string; netSales: number; target: number; earned: boolean }[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const netSales = salesByDay[date] ?? 0;
    const earned = dailyTarget > 0 && netSales >= dailyTarget;
    days.push({
      date,
      label: `${String(d).padStart(2, "0")} ${new Date(y, m - 1, d).toLocaleDateString("en-GB", { month: "short" })}`,
      netSales,
      target: dailyTarget,
      earned,
    });
  }
  const maxVal = Math.max(
    dailyTarget,
    ...days.map((x) => x.netSales),
    1
  );
  const yMax = Math.ceil(maxVal / 60000) * 60000 || 60000;
  const chartH = 120;

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Daily POS Sales vs Target</p>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            Earned Commission
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-destructive" />
            No Commission
          </span>
        </div>
      </div>
      <div className="mb-1 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-800 dark:bg-slate-200" />
          Net Sales
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
          Daily Target
        </span>
      </div>
      <div className="flex overflow-x-auto">
        <div className="flex shrink-0 flex-col justify-between pr-2" style={{ height: chartH }}>
          {[yMax, (yMax * 3) / 4, yMax / 2, yMax / 4, 0].map((tick) => (
            <span
              key={tick}
              className="text-[10px] tabular-nums text-muted-foreground"
            >
              {tick.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 border-l border-border pl-2">
          <div
            className="relative"
            style={{ height: chartH + 24 }}
          >
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-border/50"
                style={{ top: (chartH / 4) * i }}
              />
            ))}
            <div className="relative z-10 flex gap-1 overflow-x-auto" style={{ height: chartH }}>
              {days.map((day) => (
                <div
                  key={day.date}
                  className="flex min-w-[2.5rem] flex-1 flex-col items-center"
                >
                  <div
                    className="flex w-full flex-1 items-end justify-center gap-0.5"
                  >
                    <div
                      className={`w-full max-w-[10px] rounded-t ${
                        day.earned ? "bg-emerald-500" : "bg-destructive"
                      }`}
                      style={{
                        height: `${Math.max(2, (day.netSales / yMax) * chartH)}px`,
                      }}
                      title={`Net: ${fmtMoney(day.netSales)}`}
                    />
                    <div
                      className="w-full max-w-[10px] rounded-t bg-amber-500"
                      style={{
                        height: `${Math.max(2, (day.target / yMax) * chartH)}px`,
                      }}
                      title={`Target: ${fmtMoney(day.target)}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-1 overflow-x-auto pt-1">
              {days.map((day) => (
                <p
                  key={day.date}
                  className="min-w-[2.5rem] flex-1 truncate text-center text-[10px] text-muted-foreground"
                >
                  {day.label}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ShopPerformanceReport({
  reps = [],
}: {
  reps?: Rep[];
}) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [salesRepId, setSalesRepId] = useState("");
  const [viewMode, setViewMode] = useState<"daily" | "monthly">("daily");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [repsData, setRepsData] = useState<RepPerformance[]>([]);
  const [summary, setSummary] = useState<PerformanceSummary>({
    totalReps: 0,
    onTarget: 0,
    totalTarget: 0,
    totalSales: 0,
    commissionEarned: 0,
    commissionAtRisk: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const today = new Date();
    const asOf = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const res = await getPosPerformance(month, salesRepId.trim() || undefined, asOf);
    if (res.error) setError(res.error);
    else {
      setRepsData(res.reps);
      setSummary(res.summary);
    }
    setLoading(false);
  }, [month, salesRepId]);

  useEffect(() => {
    load();
  }, [load]);

  const ssrReps = reps.filter((r) => looksSSR(r));
  const repOptions = ssrReps.length ? ssrReps : reps;

  const expandAll = () => setExpandedIds(new Set(repsData.map((r) => r.repId)));
  const collapseAll = () => setExpandedIds(new Set());
  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCsv = () => {
    const headers = [
      "Rep",
      "Code",
      "Monthly Target",
      "Net Sales (MTD)",
      "Achievement %",
      "Qualifying Days",
      "Comm. Earned",
      "Comm. At Risk",
    ];
    const rows = repsData.map((r) => [
      r.repName,
      r.repCode ?? "",
      r.monthlyTarget,
      r.netSalesMtd,
      r.achievementPct,
      `${r.qualifyingDays}/${r.daysInMonth}`,
      r.commissionEarned,
      r.commissionAtRisk,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shop-performance-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Shop Performance Report</h2>
          <p className="text-sm text-muted-foreground">
            Monthly value targets vs POS actuals — commission tracking.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/50 hover:bg-destructive/10"
          >
            <Send className="mr-1.5 h-4 w-4" />
            Send Alert
          </Button>
          <Button size="sm" variant="outline">
            <FileUp className="mr-1.5 h-4 w-4" />
            Import Targets
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="mb-0.5 block text-xs font-medium">Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium">Sales Rep</label>
          <select
            value={salesRepId}
            onChange={(e) => setSalesRepId(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2.5 text-sm"
          >
            <option value="">All Sales Reps</option>
            {repOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code ? `${r.code} — ${r.name}` : r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium">Commission View</label>
          <div className="flex rounded border border-input bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("daily")}
              className={`rounded px-3 py-1.5 text-sm ${
                viewMode === "daily"
                  ? "bg-[var(--navbar)] text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setViewMode("monthly")}
              className={`rounded px-3 py-1.5 text-sm ${
                viewMode === "monthly"
                  ? "bg-[var(--navbar)] text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <Button size="sm" variant="outline" onClick={expandAll}>
            Expand All
          </Button>
          <Button size="sm" variant="outline" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Reps</p>
            <p className="text-xl font-bold tabular-nums">
              {loading ? "…" : summary.totalReps}
            </p>
            <p className="text-xs text-muted-foreground">—</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <p className="text-xs text-muted-foreground">On Target</p>
            <p className="text-xl font-bold tabular-nums">
              {loading ? "…" : `${summary.onTarget}/${summary.totalReps}`}
            </p>
            <p className="text-xs text-muted-foreground">meeting target</p>
          </CardContent>
        </Card>
        <Card className="border-amber-400/60 bg-amber-100/80 dark:border-amber-700 dark:bg-amber-950/40">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Target</p>
            <p className="text-xl font-bold tabular-nums text-amber-800 dark:text-amber-200">
              {loading ? "…" : fmtMoney(summary.totalTarget)}
            </p>
            <p className="text-xs text-muted-foreground">
              {loading ? "…" : `${CURRENCY} ${dailyTargetFromMonthly(summary.totalTarget, `${month}-01`).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/day`}
            </p>
          </CardContent>
        </Card>
        <Card className="border-emerald-400/60 bg-emerald-100/80 dark:border-emerald-700 dark:bg-emerald-950/40">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Sales</p>
            <p className="text-xl font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
              {loading ? "…" : fmtMoney(summary.totalSales)}
            </p>
            <p className="text-xs text-muted-foreground">MTD</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-400/50 bg-emerald-100/60 dark:border-emerald-700/50 dark:bg-emerald-950/30">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <p className="text-xs text-muted-foreground">Comm. Earned</p>
            <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {loading ? "…" : fmtMoney(summary.commissionEarned)}
            </p>
            <p className="text-xs text-muted-foreground">—</p>
          </CardContent>
        </Card>
        <Card className="border-red-400/50 bg-red-100/60 dark:border-red-700/50 dark:bg-red-950/30">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <p className="text-xs text-muted-foreground">Comm. At Risk</p>
            <p className="text-xl font-bold tabular-nums text-red-700 dark:text-red-300">
              {loading ? "…" : fmtMoney(summary.commissionAtRisk)}
            </p>
            <p className="text-xs text-muted-foreground">—</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          className="border-b-2 border-[var(--navbar)] px-3 py-2 text-sm font-medium text-[var(--navbar)]"
        >
          Details
        </button>
        <button
          type="button"
          className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Leaderboard
        </button>
        <button
          type="button"
          className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Products
        </button>
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">Loading…</p>
        ) : repsData.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            No targets for this month. Add SSR targets in the Targets section.
          </p>
        ) : (
          repsData.map((r) => {
            const expanded = expandedIds.has(r.repId);
            const qualDaysLabel = `${r.qualifyingDays}/${r.activeDays > 0 ? r.activeDays : 0} day${r.activeDays !== 1 ? "s" : ""} qualified / ${r.workingDaysElapsed} elapsed`;
            return (
              <Card key={r.repId} className="border-border overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 p-4 text-left hover:bg-muted/30"
                  onClick={() => toggle(r.repId)}
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.repName}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.repCode ?? "—"} • {qualDaysLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {!r.onTarget && (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    )}
                    <span
                      className={`tabular-nums font-medium ${
                        r.onTarget ? "text-emerald-600" : "text-destructive"
                      }`}
                    >
                      {fmtPct(r.achievementPct)}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmtMoney(r.netSalesMtd)}
                    </span>
                    <span className="tabular-nums font-medium">
                      {fmtMoney(r.commissionEarned)}
                    </span>
                  </div>
                </button>
                {expanded && (
                  <CardContent className="border-t border-border bg-muted/20 p-4">
                    <div className="mb-3 flex items-start gap-2 rounded-md bg-amber-100 px-3 py-2 text-sm dark:bg-amber-950/40">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-500" />
                      <p className="text-muted-foreground">
                        Commission earned daily when sales ≥ daily target ({fmtMoney(r.dailyTarget)}): {fmtPct(r.commissionPct)} of that day&apos;s net sales. Below target = no commission for that day.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                      <div className="flex flex-col items-center justify-center rounded border border-amber-300 bg-amber-100/80 p-3 text-center dark:border-amber-700 dark:bg-amber-950/40">
                        <p className="text-xs text-muted-foreground">Monthly target</p>
                        <p className="font-bold tabular-nums text-amber-800 dark:text-amber-200">
                          {fmtMoney(r.monthlyTarget)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmtMoney(r.dailyTarget)}/day
                        </p>
                      </div>
                      <div className="flex flex-col items-center justify-center rounded border border-emerald-200 bg-emerald-50/50 p-3 text-center dark:border-emerald-800 dark:bg-emerald-950/20">
                        <p className="text-xs text-muted-foreground">Net Sales (MTD)</p>
                        <p className="font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
                          {fmtMoney(r.netSalesMtd)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.invoiceCount} invoice{r.invoiceCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-center justify-center rounded border border-red-300 bg-red-100/80 p-3 text-center dark:border-red-700 dark:bg-red-950/40">
                        <p className="text-xs text-muted-foreground">Achievement</p>
                        <p className="font-bold tabular-nums text-red-800 dark:text-red-200">
                          {fmtPct(r.achievementPct)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmtMoney(Math.max(0, r.monthlyTarget - r.netSalesMtd))} left
                        </p>
                      </div>
                      <div className="flex flex-col items-center justify-center rounded border border-border bg-muted/50 p-3 text-center">
                        <p className="text-xs text-muted-foreground">Qualifying Days</p>
                        <p className="font-bold tabular-nums">
                          {r.qualifyingDays}/{r.activeDays > 0 ? r.activeDays : 0}
                        </p>
                        <p className="text-xs text-muted-foreground">days on target</p>
                      </div>
                      <div className="flex flex-col items-center justify-center rounded border border-emerald-300 bg-emerald-100/80 p-3 text-center dark:border-emerald-700 dark:bg-emerald-950/40">
                        <p className="text-xs text-muted-foreground">Comm. Earned</p>
                        <p className="font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
                          {fmtMoney(r.commissionEarned)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmtPct(r.commissionPct)} of sales on qualified days
                        </p>
                      </div>
                      <div className="flex flex-col items-center justify-center rounded border border-red-300 bg-red-100/80 p-3 text-center dark:border-red-700 dark:bg-red-950/40">
                        <p className="text-xs text-muted-foreground">Comm. At Risk</p>
                        <p className="font-bold tabular-nums text-red-800 dark:text-red-200">
                          {fmtMoney(r.commissionAtRisk)}
                        </p>
                        <p className="text-xs text-muted-foreground">—</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <p
                        className={`flex items-center gap-1.5 text-sm font-medium ${
                          r.achievementPct < 100 ? "text-destructive" : "text-emerald-600"
                        }`}
                      >
                        {r.achievementPct < 100 && (
                          <TrendingDown className="h-4 w-4 shrink-0" />
                        )}
                        {r.achievementPct >= 100
                          ? "On target"
                          : `Behind pace — expected ${fmtMoney(r.expectedByToday)} by today (${fmtPct(r.achievementPct)})`}
                      </p>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${
                            r.achievementPct >= 100 ? "bg-emerald-500" : "bg-destructive"
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, r.achievementPct))}%` }}
                        />
                      </div>
                    </div>

                    <DailySalesChart
                      month={month}
                      salesByDay={r.salesByDay}
                      dailyTarget={r.dailyTarget}
                      fmtMoney={fmtMoney}
                    />
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
