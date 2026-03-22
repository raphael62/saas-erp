"use server";

import { createClient } from "@/lib/supabase/server";
import {
  countMonthDaysExcludingSundays,
  dailyTargetFromMonthly,
} from "@/lib/month-working-days";

function n(v: string | number | null | undefined): number {
  const raw = String(v ?? "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

export type RepPerformance = {
  repId: string;
  repCode: string | null;
  repName: string;
  monthlyTarget: number;
  commissionPct: number;
  netSalesMtd: number;
  invoiceCount: number;
  qualifyingDays: number;
  activeDays: number;
  /** Working days elapsed in the month (excl. Sundays) — for "X elapsed" display */
  workingDaysElapsed: number;
  daysInMonth: number;
  achievementPct: number;
  dailyTarget: number;
  commissionEarned: number;
  commissionAtRisk: number;
  onTarget: boolean;
  expectedByToday: number;
  salesByDay: Record<string, number>;
  /** Invoice count for asOfDate (for POS "X sales" today display) */
  todayInvoiceCount: number;
};

export type PerformanceSummary = {
  totalReps: number;
  onTarget: number;
  totalTarget: number;
  totalSales: number;
  commissionEarned: number;
  commissionAtRisk: number;
};

export async function getPosPerformance(
  monthKey: string,
  salesRepId?: string,
  /** Client's local today (YYYY-MM-DD) for correct elapsed calculation */
  asOfDate?: string
): Promise<
  { reps: RepPerformance[]; summary: PerformanceSummary; error?: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { reps: [], summary: defaultSummary(), error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  const orgId = (profile as { organization_id?: string } | null)?.organization_id;
  if (!orgId) return { reps: [], summary: defaultSummary(), error: "No organization" };

  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return { reps: [], summary: defaultSummary(), error: "Invalid month" };
  const monthStart = `${monthKey}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const daysInMonth = lastDay;
  const workingDaysInMonth = countMonthDaysExcludingSundays(monthStart);

  const serverNow = new Date();
  const sy = serverNow.getFullYear();
  const sm = serverNow.getMonth() + 1;
  const sd = serverNow.getDate();

  const todayStr = (asOfDate ?? "").trim().slice(0, 10);
  const todayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayStr);
  const ay = todayMatch ? parseInt(todayMatch[1], 10) : sy;
  const am = todayMatch ? parseInt(todayMatch[2], 10) : sm;
  const ad = todayMatch ? parseInt(todayMatch[3], 10) : sd;

  let workingDaysElapsed = 0;
  if (y > ay || (y === ay && m > am)) {
    workingDaysElapsed = 0;
  } else if (y < ay || (y === ay && m < am)) {
    workingDaysElapsed = workingDaysInMonth;
  } else {
    const currentDay = Math.min(ad, lastDay);
    for (let d = 1; d <= currentDay; d++) {
      if (new Date(y, m - 1, d).getDay() !== 0) workingDaysElapsed++;
    }
  }

  const { data: ssrTargets, error: targetsErr } = await supabase
    .from("sales_ssr_monthly_targets")
    .select("id, sales_rep_id, target_value, commission_pct, sales_reps(id, code, name)")
    .eq("organization_id", orgId)
    .eq("month_start", monthStart);

  if (targetsErr) return { reps: [], summary: defaultSummary(), error: targetsErr.message };

  let targets = (ssrTargets ?? []) as Array<{
    id: string;
    sales_rep_id: string;
    target_value?: number | null;
    commission_pct?: number | null;
    sales_reps?: { id: string; code?: string | null; name: string } | null;
  }>;

  if (salesRepId?.trim()) {
    targets = targets.filter((t) => t.sales_rep_id === salesRepId.trim());
  }

  const { data: posSales } = await supabase
    .from("sales_invoices")
    .select("sales_rep_id, invoice_date, sub_total, tax_total, grand_total")
    .eq("organization_id", orgId)
    .eq("type_status", "pos")
    .gte("invoice_date", monthStart)
    .lte("invoice_date", `${monthKey}-${String(daysInMonth).padStart(2, "0")}`);

  const salesRows = (posSales ?? []) as Array<{
    sales_rep_id?: string | null;
    invoice_date?: string | null;
    sub_total?: number | null;
    tax_total?: number | null;
    grand_total?: number | null;
  }>;

  const byRepAndDay = new Map<string, Map<string, number>>();
  const byRepAndDayCount = new Map<string, Map<string, number>>();
  const viewDate = `${ay}-${String(am).padStart(2, "0")}-${String(ad).padStart(2, "0")}`;
  for (const row of salesRows) {
    const repId = String(row.sales_rep_id ?? "").trim();
    if (!repId) continue;
    const date = String(row.invoice_date ?? "").slice(0, 10);
    if (!date) continue;
    const net = n(row.sub_total) + n(row.tax_total);
    const curr = byRepAndDay.get(repId)?.get(date) ?? 0;
    if (!byRepAndDay.has(repId)) byRepAndDay.set(repId, new Map());
    byRepAndDay.get(repId)!.set(date, curr + net);
    const cnt = byRepAndDayCount.get(repId)?.get(date) ?? 0;
    if (!byRepAndDayCount.has(repId)) byRepAndDayCount.set(repId, new Map());
    byRepAndDayCount.get(repId)!.set(date, cnt + 1);
  }

  const reps: RepPerformance[] = [];
  let totalTarget = 0;
  let totalSales = 0;
  let totalCommEarned = 0;
  let totalCommAtRisk = 0;
  let onTargetCount = 0;

  for (const t of targets) {
    const repId = t.sales_rep_id;
    const rep = t.sales_reps as { id: string; code?: string | null; name: string } | null;
    const monthlyTarget = n(t.target_value);
    const commissionPct = n(t.commission_pct) / 100;
    const dailyTarget = dailyTargetFromMonthly(monthlyTarget, monthStart);

    const salesByDay = new Map<string, number>();
    const dayTotals = byRepAndDay.get(repId);
    if (dayTotals) {
      for (const [d, v] of dayTotals) salesByDay.set(d, v);
    }
    const salesByDayObj: Record<string, number> = {};
    for (const [d, v] of salesByDay) salesByDayObj[d] = v;
    const todayInvoiceCount = viewDate ? (byRepAndDayCount.get(repId)?.get(viewDate) ?? 0) : 0;

    let netSalesMtd = 0;
    let invoiceCount = 0;
    for (const row of salesRows) {
      if (String(row.sales_rep_id ?? "") !== repId) continue;
      invoiceCount += 1;
      const net = n(row.sub_total) + n(row.tax_total);
      netSalesMtd += net;
    }

    let qualifyingDays = 0;
    let activeDays = 0;
    for (const [, dayTotal] of salesByDay) {
      activeDays += 1;
      if (dayTotal >= dailyTarget && dailyTarget > 0) qualifyingDays += 1;
    }

    const achievementPct = monthlyTarget > 0 ? (netSalesMtd / monthlyTarget) * 100 : 0;
    const onTarget = achievementPct >= 100;
    if (onTarget) onTargetCount += 1;

    const fullCommission = monthlyTarget * commissionPct;
    let commissionEarned = 0;
    for (const daySales of salesByDay.values()) {
      if (dailyTarget > 0 && daySales >= dailyTarget) {
        commissionEarned += daySales * commissionPct;
      }
    }
    const commissionAtRisk = Math.max(0, fullCommission - commissionEarned);

    totalTarget += monthlyTarget;
    totalSales += netSalesMtd;
    totalCommEarned += commissionEarned;
    totalCommAtRisk += commissionAtRisk;

    const expectedByToday =
      workingDaysInMonth > 0 ? dailyTarget * workingDaysElapsed : 0;

    reps.push({
      repId,
      repCode: rep?.code ?? null,
      repName: rep?.name ?? "—",
      monthlyTarget,
      commissionPct: commissionPct * 100,
      netSalesMtd,
      invoiceCount,
      qualifyingDays,
      activeDays,
      workingDaysElapsed,
      daysInMonth,
      achievementPct,
      dailyTarget,
      commissionEarned,
      commissionAtRisk,
      onTarget,
      expectedByToday,
      salesByDay: salesByDayObj,
      todayInvoiceCount,
    });
  }

  const summary: PerformanceSummary = {
    totalReps: reps.length,
    onTarget: onTargetCount,
    totalTarget,
    totalSales,
    commissionEarned: totalCommEarned,
    commissionAtRisk: totalCommAtRisk,
  };

  return { reps, summary };
}

function defaultSummary(): PerformanceSummary {
  return {
    totalReps: 0,
    onTarget: 0,
    totalTarget: 0,
    totalSales: 0,
    commissionEarned: 0,
    commissionAtRisk: 0,
  };
}
