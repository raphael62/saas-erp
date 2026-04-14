/**
 * Shared POS cash-in / refund-out math (cash report, daily payments, etc.).
 */

import { clamp2 } from "@/lib/financial-reports";

export function posNum(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

/** First 10 chars of an ISO / timestamptz string (YYYY-MM-DD). */
export function isoDateFromTs(ts: string | null | undefined): string {
  const s = String(ts ?? "").trim();
  return s ? s.slice(0, 10) : "";
}

export type PosLineRefundRow = {
  sales_invoice_id?: string;
  qty?: number;
  cl_qty?: number;
  refunded_qty?: number;
  refunded_cl_qty?: number;
  value_tax_inc?: number;
  updated_at?: string | null;
};

/** Tax-included line value that has been refunded (proportional to qty / cl_qty). */
export function lineRefundedMerchValue(ln: PosLineRefundRow): number {
  const v = clamp2(posNum(ln.value_tax_inc));
  const rq = posNum(ln.refunded_qty);
  const rcq = posNum(ln.refunded_cl_qty);
  if (rq <= 0 && rcq <= 0) return 0;
  const q = posNum(ln.qty);
  const cq = posNum(ln.cl_qty);
  let frac = 1;
  if (q > 0) frac *= Math.min(1, rq / q);
  if (cq > 0) frac *= Math.min(1, rcq / cq);
  if (q <= 0 && cq <= 0) frac = rq > 0 || rcq > 0 ? 1 : 0;
  return clamp2(v * frac);
}

export function posMerchRefundFromLines(
  lines: PosLineRefundRow[]
): { merchRefund: number; lastRefundLineTs: string | null } {
  let merchRefund = 0;
  let lastRefundLineTs: string | null = null;
  for (const ln of lines) {
    const part = lineRefundedMerchValue(ln);
    if (part > 0) {
      merchRefund = clamp2(merchRefund + part);
      const u = String(ln.updated_at ?? "").trim();
      if (u && (!lastRefundLineTs || u > lastRefundLineTs)) lastRefundLineTs = u;
    }
  }
  return { merchRefund, lastRefundLineTs };
}

export function posCashRefundOut(collected: number, merchRefund: number): number {
  if (collected <= 0 || merchRefund <= 0) return 0;
  return clamp2(Math.min(collected, merchRefund));
}

export function posRefundBookDate(
  invoiceDate: string,
  refundedAt: string | null | undefined,
  lastRefundLineTs: string | null
): string {
  if (refundedAt) return isoDateFromTs(refundedAt);
  if (lastRefundLineTs) return isoDateFromTs(lastRefundLineTs);
  return invoiceDate;
}

export function posCollectedAtSale(grandTotal: unknown, balanceOs: unknown): number {
  return clamp2(posNum(grandTotal) - posNum(balanceOs));
}

export function addCalendarDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + delta));
  return dt.toISOString().slice(0, 10);
}
