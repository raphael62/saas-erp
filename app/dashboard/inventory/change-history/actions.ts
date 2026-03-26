"use server";

import { createClient } from "@/lib/supabase/server";
import { clamp2, dayBefore, productIdKey, purchaseLineCtn } from "@/lib/inventory-stock-snapshots";

export type ChangeHistoryRow = {
  productId: string;
  itemCode: string;
  itemName: string;
  packUnit: number;
  opening: number;
  purchases: number;
  sales: number;
  closing: number;
  orderQty: number;
  costValue: number;
  saleValue: number;
};

type ProductRow = {
  id: string | number;
  code?: string | null;
  name: string;
  category?: string | null;
  pack_unit?: number | null;
  empties_type?: string | null;
  is_active?: boolean | null;
};

type ChangeHistoryQueryOptions = {
  includeInactive?: boolean;
  excludeNoTransactions?: boolean;
  itemContains?: string | null;
  categoryContains?: string | null;
};

type MovementTotals = {
  purchases: Map<string, number>;
  sales: Map<string, number>;
};

const PRICE_TYPE_CODE_COST = "COST";
const PRICE_TYPE_CODE_RETAIL = "RETAIL";

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function escapeIlike(q: string) {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isEmptiesProduct(product: ProductRow): boolean {
  const code = (product.code ?? "").toLowerCase();
  const name = (product.name ?? "").toLowerCase();
  const emptiesType = (product.empties_type ?? "").trim();
  return code.includes("empties") || name.includes("empties") || emptiesType.length > 0;
}

function addQty(map: Map<string, number>, key: string, qty: number) {
  map.set(key, clamp2((map.get(key) ?? 0) + qty));
}

async function safeFirstDate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  dateColumn: string,
  orgId: string,
  postedOnly = false
): Promise<string | null> {
  try {
    let q = supabase.from(table).select(dateColumn).eq("organization_id", orgId);
    if (postedOnly) q = q.not("posted_at", "is", null);
    q = q.order(dateColumn, { ascending: true }).limit(1);
    const { data, error } = await q.maybeSingle();
    if (error) return null;
    const val = (data as Record<string, unknown> | null)?.[dateColumn];
    return typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;
  } catch {
    return null;
  }
}

async function resolveGoLiveDate(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string): Promise<string> {
  const { data: org } = await supabase
    .from("organizations")
    .select("inventory_history_start_date")
    .eq("id", orgId)
    .maybeSingle();
  const explicit = (org as { inventory_history_start_date?: string | null } | null)?.inventory_history_start_date;
  if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;

  const candidates = await Promise.all([
    safeFirstDate(supabase, "purchase_invoices", "invoice_date", orgId, false),
    safeFirstDate(supabase, "sales_invoices", "invoice_date", orgId, true),
    safeFirstDate(supabase, "empties_receives", "receive_date", orgId, false),
    safeFirstDate(supabase, "empties_dispatches", "dispatch_date", orgId, false),
    safeFirstDate(supabase, "location_transfers", "transfer_date", orgId, false),
  ]);

  const valid = candidates.filter((x): x is string => typeof x === "string");
  valid.sort();
  return valid[0] ?? "1970-01-01";
}

async function aggregateRangeMovements(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  from: string,
  to: string,
  productsById: Map<string, ProductRow>,
  packUnitByProduct: Map<string, number>
): Promise<MovementTotals> {
  const purchases = new Map<string, number>();
  const sales = new Map<string, number>();

  const { data: piRows } = await supabase
    .from("purchase_invoices")
    .select("id")
    .eq("organization_id", orgId)
    .gte("invoice_date", from)
    .lte("invoice_date", to);

  const piIds = (piRows ?? []).map((r: { id: string }) => r.id);
  for (const part of chunk(piIds, 120)) {
    if (part.length === 0) continue;
    const { data: lines } = await supabase
      .from("purchase_invoice_lines")
      .select("product_id, ctn_qty, btl_qty")
      .eq("organization_id", orgId)
      .in("purchase_invoice_id", part);

    for (const line of lines ?? []) {
      const pid = productIdKey((line as { product_id?: unknown }).product_id);
      if (!pid) continue;
      const product = productsById.get(pid);
      if (!product) continue;
      const pu = packUnitByProduct.get(pid) ?? 0;
      const qty = purchaseLineCtn(line as { ctn_qty?: number | null; btl_qty?: number | null }, pu);
      if (isEmptiesProduct(product)) {
        addQty(purchases, pid, qty);
      } else {
        addQty(purchases, pid, qty);
      }
    }
  }

  const { data: siRows } = await supabase
    .from("sales_invoices")
    .select("id")
    .eq("organization_id", orgId)
    .gte("invoice_date", from)
    .lte("invoice_date", to)
    .not("posted_at", "is", null);

  const siIds = (siRows ?? []).map((r: { id: string }) => r.id);
  for (const part of chunk(siIds, 120)) {
    if (part.length === 0) continue;
    const { data: lines } = await supabase
      .from("sales_invoice_lines")
      .select("product_id, cl_qty, free_qty")
      .eq("organization_id", orgId)
      .in("sales_invoice_id", part);

    for (const line of lines ?? []) {
      const pid = productIdKey((line as { product_id?: unknown }).product_id);
      if (!pid) continue;
      const product = productsById.get(pid);
      if (!product || isEmptiesProduct(product)) continue;
      const cl = clamp2(Number((line as { cl_qty?: number | null }).cl_qty ?? 0));
      const fq = clamp2(Number((line as { free_qty?: number | null }).free_qty ?? 0));
      addQty(sales, pid, clamp2(cl + fq));
    }
  }

  const { data: erRows } = await supabase
    .from("empties_receives")
    .select("id")
    .eq("organization_id", orgId)
    .gte("receive_date", from)
    .lte("receive_date", to);

  const erIds = (erRows ?? []).map((r: { id: string }) => r.id);
  for (const part of chunk(erIds, 120)) {
    if (part.length === 0) continue;
    const { data: lines } = await supabase
      .from("empties_receive_lines")
      .select("product_id, received_qty")
      .eq("organization_id", orgId)
      .in("empties_receive_id", part);

    for (const line of lines ?? []) {
      const pid = productIdKey((line as { product_id?: unknown }).product_id);
      if (!pid) continue;
      const product = productsById.get(pid);
      if (!product || !isEmptiesProduct(product)) continue;
      const received = clamp2(Number((line as { received_qty?: number | null }).received_qty ?? 0));
      addQty(purchases, pid, received);
    }
  }

  const { data: edRows } = await supabase
    .from("empties_dispatches")
    .select("id")
    .eq("organization_id", orgId)
    .gte("dispatch_date", from)
    .lte("dispatch_date", to);

  const edIds = (edRows ?? []).map((r: { id: string }) => r.id);
  for (const part of chunk(edIds, 120)) {
    if (part.length === 0) continue;
    const { data: lines } = await supabase
      .from("empties_dispatch_lines")
      .select("product_id, qty")
      .eq("organization_id", orgId)
      .in("empties_dispatch_id", part);

    for (const line of lines ?? []) {
      const pid = productIdKey((line as { product_id?: unknown }).product_id);
      if (!pid) continue;
      const product = productsById.get(pid);
      if (!product || !isEmptiesProduct(product)) continue;
      const qty = clamp2(Number((line as { qty?: number | null }).qty ?? 0));
      addQty(sales, pid, qty);
    }
  }

  // Transfer behavior without location filter: excluded (org-wide transfers are internal and net to zero).
  return { purchases, sales };
}

async function resolveCurrentPrices(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<Map<string, { cost: number; retail: number }>> {
  const out = new Map<string, { cost: number; retail: number }>();

  const { data: types } = await supabase.from("price_types").select("id, code").eq("organization_id", orgId);
  const typeIdByCode = new Map<string, string>();
  for (const t of (types ?? []) as Array<{ id: string; code?: string | null }>) {
    const code = (t.code ?? "").trim().toUpperCase();
    if (!code) continue;
    typeIdByCode.set(code, t.id);
  }

  const costTypeId = typeIdByCode.get(PRICE_TYPE_CODE_COST);
  const retailTypeId = typeIdByCode.get(PRICE_TYPE_CODE_RETAIL);
  if (!costTypeId && !retailTypeId) return out;

  const wanted = [costTypeId, retailTypeId].filter((x): x is string => Boolean(x));
  const { data: rows } = await supabase
    .from("product_prices")
    .select("product_id, price_type_id, price, is_active")
    .eq("organization_id", orgId)
    .in("price_type_id", wanted)
    .eq("is_active", true);

  for (const row of (rows ?? []) as Array<{
    product_id?: unknown;
    price_type_id?: string | null;
    price?: number | null;
  }>) {
    const pid = productIdKey(row.product_id);
    if (!pid || !row.price_type_id) continue;
    const current = out.get(pid) ?? { cost: 0, retail: 0 };
    const price = clamp2(Number(row.price ?? 0));
    if (row.price_type_id === costTypeId) current.cost = price;
    if (row.price_type_id === retailTypeId) current.retail = price;
    out.set(pid, current);
  }

  return out;
}

export async function getInventoryChangeHistory(
  orgId: string,
  fromStr?: string | null,
  toStr?: string | null,
  options?: ChangeHistoryQueryOptions
): Promise<{ rows: ChangeHistoryRow[]; from: string; to: string; error?: string }> {
  const supabase = await createClient();
  const d = defaultRange();
  const from = fromStr && /^\d{4}-\d{2}-\d{2}$/.test(fromStr) ? fromStr : d.from;
  const to = toStr && /^\d{4}-\d{2}-\d{2}$/.test(toStr) ? toStr : d.to;

  let prodQuery = supabase
    .from("products")
    .select("id, code, name, category, pack_unit, empties_type, is_active")
    .eq("organization_id", orgId);

  if (!options?.includeInactive) prodQuery = prodQuery.neq("is_active", false);

  const itemQ = (options?.itemContains ?? "").replace(/,/g, " ").trim();
  if (itemQ) {
    const e = escapeIlike(itemQ);
    prodQuery = prodQuery.or(`code.ilike.%${e}%,name.ilike.%${e}%`);
  }

  const catQ = (options?.categoryContains ?? "").trim();
  if (catQ) prodQuery = prodQuery.ilike("category", `%${escapeIlike(catQ)}%`);

  const { data: products, error: prodErr } = await prodQuery.order("code", { ascending: true, nullsFirst: false });
  if (prodErr) return { rows: [], from, to, error: prodErr.message };

  const plist = (products ?? []) as ProductRow[];
  const productsById = new Map<string, ProductRow>();
  const packUnitByProduct = new Map<string, number>();
  for (const p of plist) {
    const key = productIdKey(p.id);
    productsById.set(key, p);
    packUnitByProduct.set(key, clamp2(Number(p.pack_unit ?? 0)));
  }

  const goLive = await resolveGoLiveDate(supabase, orgId);
  const prevDay = dayBefore(from);

  let openingMovements: MovementTotals = { purchases: new Map(), sales: new Map() };
  if (goLive <= prevDay) {
    openingMovements = await aggregateRangeMovements(supabase, orgId, goLive, prevDay, productsById, packUnitByProduct);
  }

  const inRangeMovements = await aggregateRangeMovements(supabase, orgId, from, to, productsById, packUnitByProduct);
  const pricesByProduct = await resolveCurrentPrices(supabase, orgId);

  const rows: ChangeHistoryRow[] = plist.map((p) => {
    const pid = productIdKey(p.id);
    const opening = clamp2((openingMovements.purchases.get(pid) ?? 0) - (openingMovements.sales.get(pid) ?? 0));
    const purchases = inRangeMovements.purchases.get(pid) ?? 0;
    const sales = inRangeMovements.sales.get(pid) ?? 0;
    const closing = clamp2(opening + purchases - sales);
    const orderQty = clamp2(sales - closing);
    const price = pricesByProduct.get(pid) ?? { cost: 0, retail: 0 };

    return {
      productId: pid,
      itemCode: (p.code ?? p.name ?? "").trim() || "--",
      itemName: p.name,
      packUnit: clamp2(Number(p.pack_unit ?? 0)),
      opening,
      purchases,
      sales,
      closing,
      orderQty,
      costValue: clamp2(closing * price.cost),
      saleValue: clamp2(closing * price.retail),
    };
  });

  const outRows = options?.excludeNoTransactions
    ? rows.filter((r) => r.purchases !== 0 || r.sales !== 0 || r.orderQty !== 0)
    : rows;

  return { rows: outRows, from, to };
}
