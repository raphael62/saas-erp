/**
 * Helpers for financial statements built from operational subledgers (no GL journal).
 * Amounts are organization currency (e.g. GH₵).
 */

export function clamp2(n: number): number {
  return Number(Number.isFinite(n) ? n.toFixed(2) : "0");
}

export function parseISODate(s: string | null | undefined): string | null {
  const t = String(s ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

export function defaultPlRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${String(last).padStart(2, "0")}`,
  };
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Month start through today (cash report default). */
export function defaultCashReportRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${d}`,
  };
}
