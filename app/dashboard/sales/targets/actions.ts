"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv";
import { gateSalesPageAnyAction, gateSalesPageAction } from "@/lib/mutation-gate";
import { getUserTransactionScope } from "@/lib/user-transaction-scope";

function parseNum(v: FormDataEntryValue | null) {
  const raw = String(v ?? "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function clamp2(n: number) {
  return Number(n.toFixed(2));
}

function clamp4(n: number) {
  return Number(n.toFixed(4));
}

function toMonthStart(v: string) {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw.slice(0, 7)}-01`;
  return "";
}

function collectLineIndexes(formData: FormData) {
  const ix = new Set<string>();
  for (const [k] of formData.entries()) {
    if (k.startsWith("line_product_id_")) ix.add(k.replace("line_product_id_", ""));
  }
  return Array.from(ix).sort((a, b) => Number(a) - Number(b));
}

/** FormData file parts may not pass `instanceof Blob` across the server-action boundary. */
async function readFormDataUploadAsText(entry: FormDataEntryValue | null): Promise<string | null> {
  if (entry == null || typeof entry === "string") return null;
  if (typeof entry !== "object") return null;
  if (entry instanceof Blob) return entry.text();
  const duck = entry as { text?: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof duck.text === "function") return duck.text();
  if (typeof duck.arrayBuffer === "function") {
    const buf = await duck.arrayBuffer();
    return new TextDecoder().decode(buf);
  }
  return null;
}

export async function saveSSRMonthlyTarget(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim() || null;
  const gate = await gateSalesPageAction("targets", id ? "edit" : "create");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId } = gate;
  const salesRepId = String(formData.get("sales_rep_id") ?? "").trim();
  const monthStart = toMonthStart(String(formData.get("month_start") ?? ""));
  const targetValue = clamp2(parseNum(formData.get("target_value")));
  const commissionPct = clamp4(parseNum(formData.get("commission_pct")));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!salesRepId) return { error: "Sales rep is required." };
  if (!monthStart) return { error: "Month is required." };

  const payload = {
    organization_id: orgId,
    sales_rep_id: salesRepId,
    month_start: monthStart,
    target_value: targetValue,
    commission_pct: commissionPct,
    notes,
  };

  if (id) {
    const { error: upErr } = await supabase
      .from("sales_ssr_monthly_targets")
      .update(payload)
      .eq("id", id)
      .eq("organization_id", orgId);
    if (upErr) return { error: upErr.message };
  } else {
    const { error: insErr } = await supabase.from("sales_ssr_monthly_targets").insert(payload);
    if (insErr) return { error: insErr.message };
  }

  revalidatePath("/dashboard/sales/targets");
  revalidatePath("/dashboard/sales");
  return { ok: true };
}

export async function deleteSSRMonthlyTarget(id: string) {
  const gate = await gateSalesPageAction("targets", "delete");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId } = gate;

  const { error: delErr } = await supabase
    .from("sales_ssr_monthly_targets")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  if (delErr) return { error: delErr.message };

  revalidatePath("/dashboard/sales/targets");
  return { ok: true };
}

export async function saveVSRMonthlyTarget(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim() || null;
  const gate = await gateSalesPageAction("targets", id ? "edit" : "create");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId } = gate;
  const salesRepId = String(formData.get("sales_rep_id") ?? "").trim();
  const monthStart = toMonthStart(String(formData.get("month_start") ?? ""));
  const commissionPct = clamp4(parseNum(formData.get("commission_pct")));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const customerId = String(formData.get("customer_id") ?? "").trim() || null;
  if (!salesRepId) return { error: "Sales rep is required." };
  if (!monthStart) return { error: "Month is required." };

  const indexes = collectLineIndexes(formData);
  const lines: Array<{
    product_id: string;
    target_qty: number;
    target_value: number;
    unit_price: number;
    row_no: number;
  }> = [];
  let rowNo = 0;
  for (const idx of indexes) {
    const productId = String(formData.get(`line_product_id_${idx}`) ?? "").trim();
    if (!productId) continue;
    rowNo += 1;
    lines.push({
      product_id: productId,
      target_qty: clamp4(parseNum(formData.get(`line_target_qty_${idx}`))),
      target_value: clamp2(parseNum(formData.get(`line_target_value_${idx}`))),
      unit_price: clamp4(parseNum(formData.get(`line_price_${idx}`))),
      row_no: rowNo,
    });
  }
  if (lines.length === 0) return { error: "Add at least one product target line." };

  const headPayload = {
    organization_id: orgId,
    sales_rep_id: salesRepId,
    month_start: monthStart,
    commission_pct: commissionPct,
    customer_id: customerId,
    notes,
  };

  let targetId = id;
  if (targetId) {
    const { error: upErr } = await supabase
      .from("sales_vsr_monthly_targets")
      .update(headPayload)
      .eq("id", targetId)
      .eq("organization_id", orgId);
    if (upErr) return { error: upErr.message };
  } else {
    const { data: ins, error: insErr } = await supabase
      .from("sales_vsr_monthly_targets")
      .insert(headPayload)
      .select("id")
      .single();
    if (insErr) return { error: insErr.message };
    targetId = String((ins as { id: string }).id);
  }

  await supabase
    .from("sales_vsr_monthly_target_lines")
    .delete()
    .eq("vsr_monthly_target_id", targetId)
    .eq("organization_id", orgId);

  const { error: lineErr } = await supabase.from("sales_vsr_monthly_target_lines").insert(
    lines.map((l) => ({
      organization_id: orgId,
      vsr_monthly_target_id: targetId,
      product_id: l.product_id,
      target_qty: l.target_qty,
      target_value: l.target_value,
      unit_price: l.unit_price,
      row_no: l.row_no,
    }))
  );
  if (lineErr) return { error: lineErr.message };

  revalidatePath("/dashboard/sales/targets");
  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/sales/load-out-sheets");
  return { ok: true };
}

export async function deleteVSRMonthlyTarget(id: string) {
  const gate = await gateSalesPageAction("targets", "delete");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId } = gate;

  await supabase
    .from("sales_vsr_monthly_target_lines")
    .delete()
    .eq("vsr_monthly_target_id", id)
    .eq("organization_id", orgId);

  const { error: delErr } = await supabase
    .from("sales_vsr_monthly_targets")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  if (delErr) return { error: delErr.message };

  revalidatePath("/dashboard/sales/targets");
  return { ok: true };
}

type SimpleRow = Record<string, string>;

type RepRow = { id: string; code?: string | null; name?: string | null };

type CustomerRow = { id: string; name?: string | null; tax_id?: string | null; sales_rep_id?: string | null };

function normalizeCell(v: string) {
  return String(v ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function rowVal(row: SimpleRow, keys: string[]) {
  for (const k of keys) {
    const v = normalizeCell(String(row[k] ?? ""));
    if (v) return v;
  }
  return "";
}

function lower(v: string) {
  return normalizeCell(v).toLowerCase();
}

function buildRepLookups(repsRaw: RepRow[]) {
  const repById = new Map<string, string>();
  const repByCode = new Map<string, string>();
  const repByName = new Map<string, string>();
  for (const r of repsRaw) {
    const id = String(r.id);
    repById.set(id, id);
    repById.set(id.toLowerCase(), id);
    if (r.code) {
      const c = normalizeCell(String(r.code));
      if (c) repByCode.set(lower(c), id);
    }
    if (r.name) {
      const n = normalizeCell(String(r.name));
      if (n) repByName.set(lower(n), id);
    }
  }
  return { repById, repByCode, repByName };
}

function resolveRepId(repToken: string, lookups: ReturnType<typeof buildRepLookups>): string | null {
  const t = normalizeCell(repToken);
  if (!t) return null;
  const { repById, repByCode, repByName } = lookups;
  return (
    repById.get(t) ||
    repById.get(t.toLowerCase()) ||
    repByCode.get(lower(t)) ||
    repByName.get(lower(t)) ||
    null
  );
}

const REP_CSV_KEYS = [
  "sales_rep_id",
  "sales_rep_code",
  "sales_rep_name",
  "sales_rep",
  "rep_code",
  "rep_id",
  "rep_name",
  "van_sales_rep",
  "rep",
];

const CUSTOMER_CSV_KEYS = [
  "customer_id",
  "customer",
  "customer_name",
  "account",
  "van_customer",
  "route_customer",
  "customer_tax_id",
  "tax_id",
];

function buildCustomerLookups(customersRaw: CustomerRow[]) {
  const custById = new Map<string, string>();
  const custByTaxId = new Map<string, string>();
  const custByName = new Map<string, string>();
  const repByCustomerId = new Map<string, string | null>();
  for (const c of customersRaw) {
    const id = String(c.id);
    custById.set(id, id);
    custById.set(id.toLowerCase(), id);
    if (c.tax_id) {
      const tid = normalizeCell(String(c.tax_id));
      if (tid) custByTaxId.set(lower(tid), id);
    }
    if (c.name) {
      const nm = normalizeCell(String(c.name));
      if (nm) custByName.set(lower(nm), id);
    }
    repByCustomerId.set(id, c.sales_rep_id ? String(c.sales_rep_id) : null);
  }
  return { custById, custByTaxId, custByName, repByCustomerId };
}

function resolveCustomerId(
  customerToken: string,
  lookups: ReturnType<typeof buildCustomerLookups>
): string | null {
  const t = normalizeCell(customerToken);
  if (!t) return null;
  const { custById, custByTaxId, custByName } = lookups;
  return (
    custById.get(t) ||
    custById.get(t.toLowerCase()) ||
    custByTaxId.get(lower(t)) ||
    custByName.get(lower(t)) ||
    null
  );
}

/** Prefer explicit rep column; if empty, use customer's assigned sales_rep_id when present. */
function resolveVsrRowRepAndCustomer(args: {
  row: SimpleRow;
  rowIndex0: number;
  repLookups: ReturnType<typeof buildRepLookups>;
  customerLookups: ReturnType<typeof buildCustomerLookups>;
}): { repId: string; customerId: string | null } | { error: string } {
  const { row, rowIndex0, repLookups, customerLookups } = args;
  const rowNo = rowIndex0 + 2;
  const repToken = rowVal(row, REP_CSV_KEYS);
  const customerToken = rowVal(row, CUSTOMER_CSV_KEYS);
  const customerId = resolveCustomerId(customerToken, customerLookups);

  if (customerToken && !customerId) {
    const show = `"${normalizeCell(customerToken)}"`;
    return { error: `Row ${rowNo}: Could not resolve customer ${show}. Use id, tax id, or name from Customers.` };
  }

  let repId = repToken ? resolveRepId(repToken, repLookups) : null;
  const repFromCustomer = customerId ? customerLookups.repByCustomerId.get(customerId) ?? null : null;

  if (repToken && !repId) {
    const show = `"${repToken}"`;
    return {
      error: `Row ${rowNo}: Could not resolve sales rep ${show}. Use an id, code, or name from Sales → Sales reps, or leave sales rep blank and set customer to infer rep from the customer's assigned rep.`,
    };
  }

  if (!repId && repFromCustomer) {
    repId = repFromCustomer;
  }

  if (!repId) {
    return {
      error: `Row ${rowNo}: Sales rep is required (or set customer with an assigned sales rep to infer it).`,
    };
  }

  if (repFromCustomer && repFromCustomer !== repId) {
    return {
      error: `Row ${rowNo}: Sales rep does not match this customer's assigned sales rep. Fix the rep column or use a different customer.`,
    };
  }

  return { repId, customerId };
}

type ProductLookupRow = {
  id: string | number;
  code?: string | null;
  name?: string | null;
  sku?: string | null;
  barcode?: string | null;
};

/** First matching non-empty cell wins (same column can hold code, SKU, or id). */
const PRODUCT_CSV_KEYS = [
  "product_id",
  "product_code",
  "code",
  "sku",
  "barcode",
  "product_name",
  "product",
  "item_code",
  "item",
  "stock_code",
  "plu",
  "article",
];

/** Inventory list shows Item Code as `code ?? sku` (product-list.tsx). */
function productDisplayCode(p: ProductLookupRow): string {
  const c = p.code != null ? normalizeCell(String(p.code)) : "";
  if (c) return c;
  return p.sku != null ? normalizeCell(String(p.sku)) : "";
}

/** Excel / regional exports:1101.0 or1,101 — normalize for lookup. */
function productLookupTokenVariants(raw: string): string[] {
  const base = normalizeCell(raw);
  if (!base) return [];
  const out = new Set<string>();
  out.add(base);
  const lo = lower(base);
  out.add(lo);
  const plain = base.replace(/,/g, "");
  const trimmedFloat = plain.replace(/^(-?\d+)\.0+$/, "$1");
  if (trimmedFloat !== plain) {
    out.add(trimmedFloat);
    out.add(lower(trimmedFloat));
  }
  const n = Number(plain);
  if (Number.isFinite(n) && !Number.isNaN(n)) {
    const s = String(n);
    out.add(s);
    out.add(lower(s));
  }
  return [...out].filter((x) => x.length > 0);
}

function buildProductLookups(productsRaw: ProductLookupRow[]) {
  const productById = new Map<string, string>();
  const productByCode = new Map<string, string>();
  const productByName = new Map<string, string>();
  const productBySku = new Map<string, string>();
  const productByBarcode = new Map<string, string>();
  for (const p of productsRaw) {
    const pid = String(p.id);
    productById.set(pid, pid);
    productById.set(pid.toLowerCase(), pid);
    if (p.code != null) {
      const c = normalizeCell(String(p.code));
      if (c) {
        for (const v of productLookupTokenVariants(c)) {
          productByCode.set(lower(v), pid);
        }
      }
    }
    if (p.name != null) {
      const n = normalizeCell(String(p.name));
      if (n) productByName.set(lower(n), pid);
    }
    if (p.sku != null) {
      const s = normalizeCell(String(p.sku));
      if (s) {
        for (const v of productLookupTokenVariants(s)) {
          productBySku.set(lower(v), pid);
          productByCode.set(lower(v), pid);
        }
      }
    }
    if (p.barcode != null) {
      const b = normalizeCell(String(p.barcode));
      if (b) {
        for (const v of productLookupTokenVariants(b)) {
          productByBarcode.set(lower(v), pid);
        }
      }
    }
  }
  return { productById, productByCode, productByName, productBySku, productByBarcode };
}

function resolveProductId(
  productToken: string,
  lookups: ReturnType<typeof buildProductLookups>
): string | null {
  const { productById, productByCode, productByName, productBySku, productByBarcode } = lookups;
  for (const t of productLookupTokenVariants(productToken)) {
    const lo = lower(t);
    const hit =
      productById.get(t) ||
      productById.get(lo) ||
      productByCode.get(lo) ||
      productBySku.get(lo) ||
      productByBarcode.get(lo) ||
      productByName.get(lo) ||
      null;
    if (hit) return hit;
  }
  return null;
}

/**
 * Haystack mirrors inventory "Item Code" (code ?? sku) + name so short codes match SKU-only items.
 * Manual VSR picker still uses only `code` in `productLabel`; substring pass covers SKU-only gaps.
 */
function productLabelLower(p: ProductLookupRow): string {
  const c = productDisplayCode(p);
  const n = p.name ? normalizeCell(String(p.name)) : "";
  if (c && n) return lower(`${c} — ${n}`);
  if (c) return lower(c);
  return lower(n);
}

function productSearchHaystack(p: ProductLookupRow): string {
  const disp = productDisplayCode(p);
  const bits = [
    productLabelLower(p),
    disp ? lower(disp) : "",
    p.code ? lower(normalizeCell(String(p.code))) : "",
    p.name ? lower(normalizeCell(String(p.name))) : "",
    p.sku ? lower(normalizeCell(String(p.sku))) : "",
    p.barcode ? lower(normalizeCell(String(p.barcode))) : "",
  ].filter(Boolean);
  return bits.join("\n");
}

const MIN_PRODUCT_SUBSTRING_LEN = 2;

/**
 * Exact id/code/sku/barcode/name first; then substring match on the same haystack the UI picker uses
 * (`filterProducts` uses label.includes(query)), so CSV behaviour matches manual entry.
 */
function resolveProductIdForVsrImport(
  productToken: string,
  lookups: ReturnType<typeof buildProductLookups>,
  productsRaw: ProductLookupRow[]
): { productId: string } | { ambiguous: true } | { notFound: true } {
  const t = normalizeCell(productToken);
  if (!t) return { notFound: true };
  const exact = resolveProductId(productToken, lookups);
  if (exact) return { productId: exact };
  const qCandidates = [
    ...new Set(productLookupTokenVariants(productToken).map((v) => lower(normalizeCell(v)))),
  ].filter((q) => q.length >= MIN_PRODUCT_SUBSTRING_LEN);
  if (qCandidates.length === 0) return { notFound: true };
  const hits: string[] = [];
  for (const p of productsRaw) {
    const hay = productSearchHaystack(p);
    if (qCandidates.some((q) => hay.includes(q))) hits.push(String(p.id));
  }
  const unique = [...new Set(hits)];
  if (unique.length === 1) return { productId: unique[0] };
  if (unique.length > 1) return { ambiguous: true };
  return { notFound: true };
}

export async function importSSRMonthlyTargetsCsv(formData: FormData) {
  const gate = await gateSalesPageAnyAction("targets", ["create", "edit"]);
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId, userId } = gate;

  const csvText = await readFormDataUploadAsText(formData.get("file"));
  if (csvText == null) return { error: "CSV file is required" };
  const rows = parseCsv(csvText) as SimpleRow[];
  if (rows.length === 0) return { error: "CSV has no data rows" };

  const repsRes = await supabase.from("sales_reps").select("id, code, name").eq("organization_id", orgId);
  if (repsRes.error) return { error: `Could not load sales reps: ${repsRes.error.message}` };
  const repsRaw = (repsRes.data ?? []) as RepRow[];
  const scope = await getUserTransactionScope(supabase, userId, orgId);

  if (repsRaw.length === 0) {
    return { error: "No sales reps in your organization. Add reps under Sales before importing." };
  }

  const repLookups = buildRepLookups(repsRaw);

  let imported = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const repToken = rowVal(row, REP_CSV_KEYS);
    const repId = resolveRepId(repToken, repLookups);
    if (!repId) {
      const show = repToken ? `"${repToken}"` : "(empty)";
      return {
        error: `Row ${i + 2}: Could not resolve sales rep ${show}. Use an id, code, or name that exists in Sales → Sales reps (template sample codes like VSR001 are only examples).`,
      };
    }
    if (scope.restrictByRep && scope.linkedSalesRepId && repId !== scope.linkedSalesRepId) {
      return {
        error: `Row ${i + 2}: You may only import targets for your assigned sales rep.`,
      };
    }

    const monthStart = toMonthStart(rowVal(row, ["month_start", "month", "target_month"]));
    if (!monthStart) return { error: `Row ${i + 2}: month_start/month is required.` };

    const targetValue = clamp2(parseNum(rowVal(row, ["target_value", "monthly_target_value", "value_target"])));
    const commissionPct = clamp4(parseNum(rowVal(row, ["commission_pct", "commission_percentage", "commission"])));
    const notes = rowVal(row, ["notes", "remark", "remarks"]) || null;

    const { error: upErr } = await supabase.from("sales_ssr_monthly_targets").upsert(
      {
        organization_id: orgId,
        sales_rep_id: repId,
        month_start: monthStart,
        target_value: targetValue,
        commission_pct: commissionPct,
        notes,
      },
      { onConflict: "organization_id,sales_rep_id,month_start" }
    );
    if (upErr) return { error: `Row ${i + 2}: ${upErr.message}` };
    imported += 1;
  }

  revalidatePath("/dashboard/sales/targets");
  revalidatePath("/dashboard/sales");
  return { ok: true, count: imported };
}

export async function importVSRMonthlyTargetsCsv(formData: FormData) {
  const gate = await gateSalesPageAnyAction("targets", ["create", "edit"]);
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId, userId } = gate;

  const csvText = await readFormDataUploadAsText(formData.get("file"));
  if (csvText == null) return { error: "CSV file is required" };
  const rows = parseCsv(csvText) as SimpleRow[];
  if (rows.length === 0) return { error: "CSV has no data rows" };

  const repsRes = await supabase.from("sales_reps").select("id, code, name").eq("organization_id", orgId);
  if (repsRes.error) return { error: `Could not load sales reps: ${repsRes.error.message}` };
  const repsRaw = (repsRes.data ?? []) as RepRow[];
  const scope = await getUserTransactionScope(supabase, userId, orgId);
  const productsRes = await supabase
    .from("products")
    .select("id, code, name, sku, barcode")
    .eq("organization_id", orgId);
  if (productsRes.error) return { error: `Could not load products: ${productsRes.error.message}` };
  const products = (productsRes.data ?? []) as ProductLookupRow[];
  const customersRes = await supabase
    .from("customers")
    .select("id, name, tax_id, sales_rep_id")
    .eq("organization_id", orgId);
  if (customersRes.error) return { error: `Could not load customers: ${customersRes.error.message}` };
  const customersRaw = (customersRes.data ?? []) as CustomerRow[];

  if (repsRaw.length === 0) {
    return { error: "No sales reps in your organization. Add reps under Sales before importing." };
  }

  const repLookups = buildRepLookups(repsRaw);
  const customerLookups = buildCustomerLookups(customersRaw);

  const productLookups = buildProductLookups(products);

  const grouped = new Map<
    string,
    {
      sales_rep_id: string;
      month_start: string;
      customer_id: string | null;
      commission_pct: number;
      notes: string | null;
      lines: Map<string, { qty: number; value: number }>;
    }
  >();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rc = resolveVsrRowRepAndCustomer({
      row,
      rowIndex0: i,
      repLookups,
      customerLookups,
    });
    if ("error" in rc) return { error: rc.error };
    const { repId, customerId } = rc;

    if (scope.restrictByRep && scope.linkedSalesRepId && repId !== scope.linkedSalesRepId) {
      return {
        error: `Row ${i + 2}: You may only import targets for your assigned sales rep.`,
      };
    }

    const monthStart = toMonthStart(rowVal(row, ["month_start", "month", "target_month"]));
    if (!monthStart) return { error: `Row ${i + 2}: month_start/month is required.` };

    const productToken = rowVal(row, PRODUCT_CSV_KEYS);
    const resolved = resolveProductIdForVsrImport(productToken, productLookups, products);
    if ("ambiguous" in resolved) {
      const show = productToken ? `"${productToken}"` : "(empty)";
      return {
        error: `Row ${i + 2}: Product ${show} matches more than one item (the manual picker would show several rows). Use the full product code, exact catalog name, or id in the CSV.`,
      };
    }
    if ("notFound" in resolved) {
      const show = productToken ? `"${productToken}"` : "(empty)";
      return {
        error: `Row ${i + 2}: Could not resolve product ${show}. Use id, code, SKU, barcode, or a fragment that uniquely matches the same label you see when typing in the manual form.`,
      };
    }
    const { productId } = resolved;

    const key = `${repId}__${monthStart}`;
    const current =
      grouped.get(key) ??
      {
        sales_rep_id: repId,
        month_start: monthStart,
        customer_id: null as string | null,
        commission_pct: 0,
        notes: null as string | null,
        lines: new Map<string, { qty: number; value: number }>(),
      };

    if (customerId) {
      if (!current.customer_id) current.customer_id = customerId;
      else if (current.customer_id !== customerId) {
        return {
          error: `Row ${i + 2}: Conflicting customer for the same sales rep and month. Use one customer (or blank) per target.`,
        };
      }
    }

    const commissionPct = clamp4(parseNum(rowVal(row, ["commission_pct", "commission_percentage", "commission"])));
    if (commissionPct) current.commission_pct = commissionPct;
    const notes = rowVal(row, ["notes", "remark", "remarks"]);
    if (notes) current.notes = notes;

    const existingLine = current.lines.get(productId) ?? { qty: 0, value: 0 };
    existingLine.qty = clamp4(existingLine.qty + clamp4(parseNum(rowVal(row, ["target_qty", "qty_target", "qty"]))));
    existingLine.value = clamp2(
      existingLine.value + clamp2(parseNum(rowVal(row, ["target_value", "monthly_target_value", "value_target"])))
    );
    current.lines.set(productId, existingLine);
    grouped.set(key, current);
  }

  let imported = 0;
  for (const entry of grouped.values()) {
    const { data: headRows, error: headErr } = await supabase
      .from("sales_vsr_monthly_targets")
      .upsert(
        {
          organization_id: orgId,
          sales_rep_id: entry.sales_rep_id,
          month_start: entry.month_start,
          customer_id: entry.customer_id,
          commission_pct: entry.commission_pct,
          notes: entry.notes,
        },
        { onConflict: "organization_id,sales_rep_id,month_start" }
      )
      .select("id");
    if (headErr) return { error: headErr.message };
    const head = headRows?.[0] as { id: string } | undefined;
    if (!head?.id) return { error: "Failed to save VSR target header (no row returned)." };

    const targetId = String(head.id);
    await supabase
      .from("sales_vsr_monthly_target_lines")
      .delete()
      .eq("vsr_monthly_target_id", targetId)
      .eq("organization_id", orgId);

    let rowNo = 0;
    const lineRows = [...entry.lines.entries()].map(([product_id, val]) => {
      rowNo += 1;
      const unitPrice = val.qty > 0 ? val.value / val.qty : 0;
      return {
        organization_id: orgId,
        vsr_monthly_target_id: targetId,
        product_id,
        target_qty: val.qty,
        target_value: val.value,
        unit_price: clamp4(unitPrice),
        row_no: rowNo,
      };
    });
    if (lineRows.length > 0) {
      const { error: lineErr } = await supabase.from("sales_vsr_monthly_target_lines").insert(lineRows);
      if (lineErr) return { error: lineErr.message };
    }
    imported += 1;
  }

  revalidatePath("/dashboard/sales/targets");
  revalidatePath("/dashboard/sales");
  return { ok: true, count: imported };
}

export type TargetsCsvImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; count: number };

export async function importSSRMonthlyTargetsCsvFormAction(
  _prev: TargetsCsvImportState,
  formData: FormData
): Promise<TargetsCsvImportState> {
  const res = await importSSRMonthlyTargetsCsv(formData);
  if ("error" in res && res.error) return { status: "error", message: res.error };
  const count = "count" in res && typeof res.count === "number" ? res.count : 0;
  return { status: "success", count };
}

export async function importVSRMonthlyTargetsCsvFormAction(
  _prev: TargetsCsvImportState,
  formData: FormData
): Promise<TargetsCsvImportState> {
  const res = await importVSRMonthlyTargetsCsv(formData);
  if ("error" in res && res.error) return { status: "error", message: res.error };
  const count = "count" in res && typeof res.count === "number" ? res.count : 0;
  return { status: "success", count };
}
