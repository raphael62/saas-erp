import type { SupabaseClient } from "@supabase/supabase-js";

export function clamp2(n: number) {
  return Number(n.toFixed(2));
}

/** ISO date YYYY-MM-DD only */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function dayAfter(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Stable map key for product id (uuid string or legacy integer). */
export function productIdKey(id: unknown): string {
  return id == null ? "" : String(id);
}

/** Value for DB writes when `products.id` is integer (PostgREST JSON prefers number). */
export function productIdForDb(value: string): string | number {
  if (/^\d{1,18}$/.test(value)) {
    const n = Number(value);
    if (Number.isSafeInteger(n)) return n;
  }
  return value;
}

/** PostgREST GET URLs fail with 400 when `.in()` lists are too long; keep requests small. */
const SNAPSHOT_IN_CHUNK = 100;
const SNAPSHOT_UPSERT_CHUNK = 150;

export function purchaseLineCtn(
  line: { ctn_qty?: number | null; btl_qty?: number | null },
  packUnit: number
): number {
  const ctn = clamp2(Number(line.ctn_qty ?? 0));
  const btl = clamp2(Number(line.btl_qty ?? 0));
  const pu = packUnit > 0 ? packUnit : 0;
  const fromBtl = pu > 0 ? clamp2(btl / pu) : 0;
  return clamp2(ctn + fromBtl);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function resolveAnchorDate(supabase: SupabaseClient, orgId: string): Promise<string> {
  const { data: org } = await supabase
    .from("organizations")
    .select("inventory_history_anchor_date")
    .eq("id", orgId)
    .maybeSingle();
  const anchor = (org as { inventory_history_anchor_date?: string | null } | null)?.inventory_history_anchor_date;
  if (anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) return anchor;

  const { data: pi } = await supabase
    .from("purchase_invoices")
    .select("invoice_date")
    .eq("organization_id", orgId)
    .order("invoice_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: si } = await supabase
    .from("sales_invoices")
    .select("invoice_date")
    .eq("organization_id", orgId)
    .not("posted_at", "is", null)
    .order("invoice_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  const candidates = [pi?.invoice_date, si?.invoice_date].filter(
    (x): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)
  );
  candidates.sort();
  return candidates[0] ?? "1970-01-01";
}

async function aggregatePurchasesCtn(
  supabase: SupabaseClient,
  orgId: string,
  fromInclusive: string,
  toInclusive: string,
  packUnitByProduct: Map<string, number>
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  let q = supabase
    .from("purchase_invoices")
    .select("id")
    .eq("organization_id", orgId)
    .gte("invoice_date", fromInclusive)
    .lte("invoice_date", toInclusive);
  const { data: piRows, error } = await q;
  if (error) throw new Error(error.message);
  const ids = (piRows ?? []).map((r: { id: string }) => r.id);
  for (const part of chunk(ids, 120)) {
    if (part.length === 0) continue;
    const { data: lines, error: le } = await supabase
      .from("purchase_invoice_lines")
      .select("product_id, ctn_qty, btl_qty")
      .eq("organization_id", orgId)
      .in("purchase_invoice_id", part);
    if (le) throw new Error(le.message);
    for (const line of lines ?? []) {
      const raw = (line as { product_id?: string | number | null }).product_id;
      const pid = productIdKey(raw);
      if (!pid) continue;
      const pu = packUnitByProduct.get(pid) ?? 0;
      const add = purchaseLineCtn(line as { ctn_qty?: number | null; btl_qty?: number | null }, pu);
      out.set(pid, clamp2((out.get(pid) ?? 0) + add));
    }
  }
  return out;
}

async function aggregateSalesCtn(
  supabase: SupabaseClient,
  orgId: string,
  fromInclusive: string,
  toInclusive: string
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data: siRows, error } = await supabase
    .from("sales_invoices")
    .select("id")
    .eq("organization_id", orgId)
    .gte("invoice_date", fromInclusive)
    .lte("invoice_date", toInclusive)
    .not("posted_at", "is", null);
  if (error) throw new Error(error.message);
  const ids = (siRows ?? []).map((r: { id: string }) => r.id);
  for (const part of chunk(ids, 120)) {
    if (part.length === 0) continue;
    const { data: lines, error: le } = await supabase
      .from("sales_invoice_lines")
      .select("product_id, cl_qty, free_qty")
      .eq("organization_id", orgId)
      .in("sales_invoice_id", part);
    if (le) throw new Error(le.message);
    for (const line of lines ?? []) {
      const raw = (line as { product_id?: string | number | null }).product_id;
      const pid = productIdKey(raw);
      if (!pid) continue;
      const cl = clamp2(Number((line as { cl_qty?: number }).cl_qty ?? 0));
      const fq = clamp2(Number((line as { free_qty?: number }).free_qty ?? 0));
      const qty = clamp2(cl + fq);
      out.set(pid, clamp2((out.get(pid) ?? 0) + qty));
    }
  }
  return out;
}

async function fetchSnapshotsForDate(
  supabase: SupabaseClient,
  orgId: string,
  snapshotDate: string,
  ids: string[]
): Promise<Array<{ product_id: unknown; closing_qty: unknown }>> {
  const rows: Array<{ product_id: unknown; closing_qty: unknown }> = [];
  for (const part of chunk(ids, SNAPSHOT_IN_CHUNK)) {
    if (part.length === 0) continue;
    const { data, error } = await supabase
      .from("inventory_stock_snapshots")
      .select("product_id, closing_qty")
      .eq("organization_id", orgId)
      .eq("snapshot_date", snapshotDate)
      .in("product_id", part);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows;
}

async function fetchSnapshotsPriorToDate(
  supabase: SupabaseClient,
  orgId: string,
  beforeDate: string,
  productIds: string[]
): Promise<Array<{ product_id: unknown; snapshot_date: string; closing_qty: unknown }>> {
  const rows: Array<{ product_id: unknown; snapshot_date: string; closing_qty: unknown }> = [];
  for (const part of chunk(productIds, SNAPSHOT_IN_CHUNK)) {
    if (part.length === 0) continue;
    const { data, error } = await supabase
      .from("inventory_stock_snapshots")
      .select("product_id, snapshot_date, closing_qty")
      .eq("organization_id", orgId)
      .lt("snapshot_date", beforeDate)
      .in("product_id", part)
      .order("snapshot_date", { ascending: false });
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  rows.sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
  return rows;
}

/**
 * Closing carton qty at end of `asOfDate` (inclusive of all movements on that day).
 * Uses snapshot row when present; otherwise rolls forward from latest prior snapshot + net movements, then upserts.
 */
export async function getOrBuildClosingAtEndOfDay(
  supabase: SupabaseClient,
  orgId: string,
  asOfDate: string,
  productIds: string[],
  packUnitByProduct: Map<string, number>
): Promise<Map<string, number>> {
  const ids = productIds.map(productIdKey).filter(Boolean);
  if (ids.length === 0) return new Map();

  const anchor = await resolveAnchorDate(supabase, orgId);

  const direct = await fetchSnapshotsForDate(supabase, orgId, asOfDate, ids);

  const result = new Map<string, number>();
  const hit = new Set<string>();
  for (const row of direct) {
    const pid = productIdKey((row as { product_id: unknown }).product_id);
    if (!pid) continue;
    result.set(pid, clamp2(Number((row as { closing_qty: number }).closing_qty ?? 0)));
    hit.add(pid);
  }

  const missing = ids.filter((id) => !hit.has(id));
  if (missing.length === 0) return result;

  const priorRows = await fetchSnapshotsPriorToDate(supabase, orgId, asOfDate, missing);

  const latestPrior = new Map<string, { date: string; qty: number }>();
  for (const row of priorRows) {
    const pid = productIdKey((row as { product_id: unknown }).product_id);
    if (!pid || latestPrior.has(pid)) continue;
    latestPrior.set(pid, {
      date: (row as { snapshot_date: string }).snapshot_date,
      qty: clamp2(Number((row as { closing_qty: number }).closing_qty ?? 0)),
    });
  }

  const toUpsert: Array<{
    organization_id: string;
    snapshot_date: string;
    product_id: string | number;
    closing_qty: number;
  }> = [];

  const byFromInclusive = new Map<string, Array<{ pid: string; baseQty: number }>>();

  for (const pid of missing) {
    const prior = latestPrior.get(pid);
    let fromInclusive: string;
    let baseQty: number;
    if (prior) {
      fromInclusive = dayAfter(prior.date);
      baseQty = prior.qty;
    } else {
      fromInclusive = anchor;
      baseQty = 0;
    }

    if (fromInclusive > asOfDate) {
      result.set(pid, baseQty);
      toUpsert.push({
        organization_id: orgId,
        snapshot_date: asOfDate,
        product_id: productIdForDb(pid),
        closing_qty: baseQty,
      });
      continue;
    }

    let bucket = byFromInclusive.get(fromInclusive);
    if (!bucket) {
      bucket = [];
      byFromInclusive.set(fromInclusive, bucket);
    }
    bucket.push({ pid, baseQty });
  }

  for (const [fromInclusive, buckets] of byFromInclusive) {
    const [pur, sal] = await Promise.all([
      aggregatePurchasesCtn(supabase, orgId, fromInclusive, asOfDate, packUnitByProduct),
      aggregateSalesCtn(supabase, orgId, fromInclusive, asOfDate),
    ]);
    for (const { pid, baseQty } of buckets) {
      const net = (pur.get(pid) ?? 0) - (sal.get(pid) ?? 0);
      const closing = clamp2(baseQty + net);
      result.set(pid, closing);
      toUpsert.push({
        organization_id: orgId,
        snapshot_date: asOfDate,
        product_id: productIdForDb(pid),
        closing_qty: closing,
      });
    }
  }

  if (toUpsert.length > 0) {
    for (const part of chunk(toUpsert, SNAPSHOT_UPSERT_CHUNK)) {
      const { error: uErr } = await supabase.from("inventory_stock_snapshots").upsert(part, {
        onConflict: "organization_id,snapshot_date,product_id",
      });
      if (uErr) throw new Error(uErr.message);
    }
  }

  return result;
}

/**
 * Opening at start of `fromDate` = closing at end of previous calendar day.
 */
export async function getOpeningBalancesForFromDate(
  supabase: SupabaseClient,
  orgId: string,
  fromDate: string,
  productIds: string[],
  packUnitByProduct: Map<string, number>
): Promise<Map<string, number>> {
  const prev = dayBefore(fromDate);
  return getOrBuildClosingAtEndOfDay(supabase, orgId, prev, productIds, packUnitByProduct);
}
