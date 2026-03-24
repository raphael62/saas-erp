"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { countMonthDaysExcludingSundays } from "@/lib/month-working-days";

async function getOrgContext() {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { supabase: ctx.supabase, orgId: null as string | null, error: ctx.error };
  return { supabase: ctx.supabase, orgId: ctx.orgId, error: null as string | null };
}

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

async function nextSheetNo(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string) {
  const { data } = await supabase
    .from("load_out_sheets")
    .select("sheet_no")
    .eq("organization_id", orgId)
    .ilike("sheet_no", "LOS-%")
    .order("sheet_no", { ascending: false })
    .limit(1);
  const latest = String(data?.[0]?.sheet_no ?? "");
  const m = latest.match(/^LOS-(\d+)$/i);
  const n = m ? parseInt(m[1], 10) + 1 : 1;
  return `LOS-${String(n).padStart(5, "0")}`;
}

function collectLinkedRequestIds(formData: FormData): string[] {
  const raw = String(formData.get("linked_vsr_ids") ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function collectLineIndexes(formData: FormData) {
  const ix = new Set<string>();
  for (const [k] of formData.entries()) {
    if (k.startsWith("line_product_id_")) ix.add(k.replace("line_product_id_", ""));
  }
  return Array.from(ix).sort((a, b) => Number(a) - Number(b));
}

type RequestType = "top_up" | "second_load" | "returns" | "add_request";

type AggLine = {
  product_id: string;
  product_code_snapshot: string | null;
  product_name_snapshot: string | null;
  unit: string;
  source_request_no: string | null;
  load_out_qty: number;
  top_up_qty: number;
  second_load_qty: number;
  add_req_qty: number;
  returns_qty: number;
  van_stocks_qty: number;
  van_sales_qty: number;
  unit_price: number;
  sales_value: number;
  row_no: number;
};

function calcDerived(line: {
  load_out_qty: number;
  top_up_qty: number;
  second_load_qty: number;
  returns_qty: number;
  add_req_qty: number;
  unit_price: number;
  category?: string;
  pack_unit?: number;
}) {
  const vanStocks = clamp4(line.returns_qty + line.add_req_qty);
  const vanSales = clamp4(line.load_out_qty + line.top_up_qty + line.second_load_qty - line.returns_qty);
  const category = String(line.category ?? "").trim();
  const packUnit = Number(line.pack_unit ?? 0);
  const isSpirits = category === "GGBL Spirits" && packUnit > 0;
  const salesValue = isSpirits
    ? clamp2((line.unit_price / packUnit) * vanSales)
    : clamp2(vanSales * line.unit_price);
  return { vanStocks, vanSales, salesValue };
}

async function getLatestPriorVanStocksByProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  salesRepId: string,
  locationId: string,
  salesDate: string,
  productIds: string[]
) {
  const out = new Map<string, number>();
  if (!productIds.length) return out;

  const { data: priorSheets } = await supabase
    .from("load_out_sheets")
    .select("id, sales_date")
    .eq("organization_id", orgId)
    .eq("sales_rep_id", salesRepId)
    .eq("location_id", locationId)
    .lt("sales_date", salesDate)
    .order("sales_date", { ascending: false })
    .limit(60);

  const sheetIds = (priorSheets ?? []).map((s: { id: string }) => s.id);
  if (!sheetIds.length) return out;

  const { data: priorLines } = await supabase
    .from("load_out_sheet_lines")
    .select("load_out_sheet_id, product_id, van_stocks_qty")
    .eq("organization_id", orgId)
    .in("load_out_sheet_id", sheetIds)
    .in("product_id", productIds);

  const linesBySheet = new Map<string, Array<{ product_id: string; van_stocks_qty?: number | null }>>();
  for (const l of priorLines ?? []) {
    const sid = String((l as { load_out_sheet_id?: string }).load_out_sheet_id ?? "");
    if (!sid) continue;
    const arr = linesBySheet.get(sid) ?? [];
    arr.push({
      product_id: String((l as { product_id?: string | null }).product_id ?? ""),
      van_stocks_qty: (l as { van_stocks_qty?: number | null }).van_stocks_qty,
    });
    linesBySheet.set(sid, arr);
  }

  for (const s of priorSheets ?? []) {
    const arr = linesBySheet.get(String((s as { id?: string }).id ?? "")) ?? [];
    for (const l of arr) {
      if (!l.product_id || out.has(l.product_id)) continue;
      out.set(l.product_id, clamp4(Number(l.van_stocks_qty ?? 0)));
    }
    if (out.size >= productIds.length) break;
  }
  return out;
}

async function recalcAndPersistSheetLines({
  supabase,
  orgId,
  sheetId,
  rows,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  sheetId: string;
  rows: AggLine[];
}) {
  await supabase.from("load_out_sheet_lines").delete().eq("load_out_sheet_id", sheetId).eq("organization_id", orgId);

  let totalLoad = 0;
  let totalSales = 0;
  let totalValue = 0;
  for (const r of rows) {
    totalLoad = clamp4(totalLoad + r.load_out_qty);
    totalSales = clamp4(totalSales + r.van_sales_qty);
    totalValue = clamp2(totalValue + r.sales_value);
  }

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("load_out_sheet_lines").insert(
      rows.map((r) => ({
        organization_id: orgId,
        load_out_sheet_id: sheetId,
        product_id: r.product_id,
        product_code_snapshot: r.product_code_snapshot,
        product_name_snapshot: r.product_name_snapshot,
        unit: r.unit,
        source_request_no: r.source_request_no,
        load_out_qty: r.load_out_qty,
        top_up_qty: r.top_up_qty,
        second_load_qty: r.second_load_qty,
        add_req_qty: r.add_req_qty,
        van_stocks_qty: r.van_stocks_qty,
        returns_qty: r.returns_qty,
        van_sales_qty: r.van_sales_qty,
        unit_price: r.unit_price,
        sales_value: r.sales_value,
        row_no: r.row_no,
      }))
    );
    if (insErr) return { error: insErr.message };
  }

  const { error: upErr } = await supabase
    .from("load_out_sheets")
    .update({
      total_loadout_qty: totalLoad,
      total_van_sales_qty: totalSales,
      total_sales_value: totalValue,
    })
    .eq("id", sheetId)
    .eq("organization_id", orgId);
  if (upErr) return { error: upErr.message };
  return { ok: true as const };
}

/** Sets customer from VSR header and daily_target = sum over sheet products of (VSR target_qty / days in month excl. Sundays). */
async function syncLoadOutHeaderFromVsr(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  sheetId: string,
  salesRepId: string,
  salesDate: string,
  productIds: string[]
) {
  if (!salesRepId || !salesDate) return;
  const monthStart = `${salesDate.slice(0, 7)}-01`;
  const { data: vsr } = await supabase
    .from("sales_vsr_monthly_targets")
    .select("id, customer_id")
    .eq("organization_id", orgId)
    .eq("sales_rep_id", salesRepId)
    .eq("month_start", monthStart)
    .maybeSingle();

  const wd = countMonthDaysExcludingSundays(salesDate);
  let dailySum = 0;
  let customerId: string | null = null;

  if (vsr && wd > 0 && productIds.length > 0) {
    customerId = (vsr as { customer_id?: string | null }).customer_id ?? null;
    const { data: vlines } = await supabase
      .from("sales_vsr_monthly_target_lines")
      .select("product_id, target_qty")
      .eq("organization_id", orgId)
      .eq("vsr_monthly_target_id", (vsr as { id: string }).id)
      .in("product_id", productIds);

    const wanted = new Set(productIds.map(String));
    for (const vl of vlines ?? []) {
      const pid = String((vl as { product_id?: string | null }).product_id ?? "");
      if (!wanted.has(pid)) continue;
      const tq = Number((vl as { target_qty?: number | null }).target_qty ?? 0);
      dailySum += tq / wd;
    }
  } else if (vsr) {
    customerId = (vsr as { customer_id?: string | null }).customer_id ?? null;
  }

  await supabase
    .from("load_out_sheets")
    .update({
      customer_id: customerId,
      daily_target: clamp4(dailySum),
    })
    .eq("id", sheetId)
    .eq("organization_id", orgId);
}

export async function syncLoadOutLinesFromRequests(sheetId: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const { data: sheet } = await supabase
    .from("load_out_sheets")
    .select("id, status, sales_rep_id, location_id, sales_date")
    .eq("id", sheetId)
    .eq("organization_id", orgId)
    .single();
  if (!sheet) return { error: "Load out sheet not found." };
  if ((sheet as { status?: string }).status !== "draft") return { error: "Only draft sheets can be synced." };

  const { data: links } = await supabase
    .from("load_out_sheet_stock_requests")
    .select("van_stock_request_id")
    .eq("load_out_sheet_id", sheetId)
    .eq("organization_id", orgId);

  const vsrIds = (links ?? []).map((r: { van_stock_request_id: string }) => r.van_stock_request_id);
  if (vsrIds.length === 0) return { error: "Link at least one approved stock request first." };

  const { data: vsrs } = await supabase
    .from("van_stock_requests")
    .select("id, request_no, status, request_type")
    .eq("organization_id", orgId)
    .in("id", vsrIds);

  for (const v of vsrs ?? []) {
    if (String((v as { status?: string }).status) !== "approved") {
      return { error: `Request ${(v as { request_no?: string }).request_no} is not approved.` };
    }
  }

  const { data: vsrLines } = await supabase
    .from("van_stock_request_lines")
    .select("van_stock_request_id, product_id, product_code_snapshot, product_name_snapshot, qty_ctn")
    .eq("organization_id", orgId)
    .in("van_stock_request_id", vsrIds);

  const requestById = new Map<string, { request_no: string; request_type: RequestType }>();
  for (const v of vsrs ?? []) {
    requestById.set(String((v as { id: string }).id), {
      request_no: String((v as { request_no?: string }).request_no ?? ""),
      request_type: String((v as { request_type?: string }).request_type ?? "top_up") as RequestType,
    });
  }

  type Agg = {
    product_id: string;
    code: string;
    name: string;
    top_up: number;
    second_load: number;
    add_req: number;
    returns: number;
  };
  const byProduct = new Map<string, Agg>();

  for (const line of vsrLines ?? []) {
    const pid = String((line as { product_id?: string | null }).product_id ?? "").trim();
    if (!pid) continue;
    const qty = clamp4(Number((line as { qty_ctn?: number }).qty_ctn ?? 0));
    if (!qty) continue;
    const rid = String((line as { van_stock_request_id?: string }).van_stock_request_id ?? "");
    const req = requestById.get(rid);
    const rno = req?.request_no ?? rid;
    const reqType = req?.request_type ?? "top_up";
    const code = String((line as { product_code_snapshot?: string }).product_code_snapshot ?? "");
    const name = String((line as { product_name_snapshot?: string }).product_name_snapshot ?? "");
    const cur = byProduct.get(pid) ?? {
      product_id: pid,
      code,
      name,
      top_up: 0,
      second_load: 0,
      add_req: 0,
      returns: 0,
    };
    if (reqType === "top_up") cur.top_up = clamp4(cur.top_up + qty);
    else if (reqType === "second_load") cur.second_load = clamp4(cur.second_load + qty);
    else if (reqType === "add_request") cur.add_req = clamp4(cur.add_req + qty);
    else if (reqType === "returns") cur.returns = clamp4(cur.returns + qty);
    if (!cur.code && code) cur.code = code;
    if (!cur.name && name) cur.name = name;
    byProduct.set(pid, cur);
  }

  const productsRes = await supabase
    .from("products")
    .select("id, unit")
    .eq("organization_id", orgId)
    .in("id", [...byProduct.keys()]);

  const priceByProduct = new Map<string, number>();
  const unitByProduct = new Map<string, string>();
  for (const p of productsRes.data ?? []) {
    const id = String((p as { id: string }).id);
    priceByProduct.set(id, 0);
    unitByProduct.set(id, String((p as { unit?: string }).unit ?? "CTN"));
  }

  const carryLoadOut = await getLatestPriorVanStocksByProduct(
    supabase,
    orgId,
    String((sheet as { sales_rep_id?: string | null }).sales_rep_id ?? ""),
    String((sheet as { location_id?: string | null }).location_id ?? ""),
    String((sheet as { sales_date?: string }).sales_date ?? ""),
    [...byProduct.keys()]
  );

  let rowNo = 0;
  const rows: AggLine[] = [...byProduct.values()].map((agg) => {
    rowNo += 1;
    const unitPrice = priceByProduct.get(agg.product_id) ?? 0;
    const loadOut = clamp4(carryLoadOut.get(agg.product_id) ?? 0);
    const d = calcDerived({
      load_out_qty: loadOut,
      top_up_qty: agg.top_up,
      second_load_qty: agg.second_load,
      returns_qty: agg.returns,
      add_req_qty: agg.add_req,
      unit_price: unitPrice,
    });
    return {
      product_id: agg.product_id,
      product_code_snapshot: agg.code || null,
      product_name_snapshot: agg.name || null,
      unit: unitByProduct.get(agg.product_id) ?? "CTN",
      source_request_no: null,
      load_out_qty: loadOut,
      top_up_qty: agg.top_up,
      second_load_qty: agg.second_load,
      add_req_qty: agg.add_req,
      returns_qty: agg.returns,
      van_stocks_qty: d.vanStocks,
      van_sales_qty: d.vanSales,
      unit_price: unitPrice,
      sales_value: d.salesValue,
      row_no: rowNo,
    };
  });

  const saved = await recalcAndPersistSheetLines({ supabase, orgId, sheetId, rows });
  if ("error" in saved) return saved;

  await syncLoadOutHeaderFromVsr(
    supabase,
    orgId,
    sheetId,
    String((sheet as { sales_rep_id?: string | null }).sales_rep_id ?? ""),
    String((sheet as { sales_date?: string }).sales_date ?? ""),
    rows.map((r) => r.product_id)
  );

  revalidatePath("/dashboard/sales/load-out-sheets");
  return { ok: true, lineCount: rows.length };
}

export async function applyApprovedStockRequestToLoadOut(requestId: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const { data: req } = await supabase
    .from("van_stock_requests")
    .select("id, request_no, request_type, status, sales_rep_id, location_id, request_date")
    .eq("organization_id", orgId)
    .eq("id", requestId)
    .single();
  if (!req) return { error: "Stock request not found." };
  if (String((req as { status?: string }).status) !== "approved") return { error: "Only approved requests can update Load Out." };

  const salesRepId = String((req as { sales_rep_id?: string | null }).sales_rep_id ?? "").trim();
  const locationId = String((req as { location_id?: string | null }).location_id ?? "").trim();
  const salesDate = String((req as { request_date?: string }).request_date ?? "").trim();
  if (!salesRepId || !locationId || !salesDate) return { error: "Approved request is missing rep, location or date." };
  const requestType = String((req as { request_type?: string }).request_type ?? "top_up") as RequestType;
  const requestNo = String((req as { request_no?: string }).request_no ?? "").trim();

  const { data: lines } = await supabase
    .from("van_stock_request_lines")
    .select("product_id, product_code_snapshot, product_name_snapshot, qty_ctn")
    .eq("organization_id", orgId)
    .eq("van_stock_request_id", requestId);
  if (!lines?.length) return { error: "Approved request has no lines." };

  const { data: existingSheet } = await supabase
    .from("load_out_sheets")
    .select("id, sheet_no, status")
    .eq("organization_id", orgId)
    .eq("sales_rep_id", salesRepId)
    .eq("location_id", locationId)
    .eq("sales_date", salesDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sheetId = String((existingSheet as { id?: string } | null)?.id ?? "");
  if (!sheetId) {
    const sheetNo = await nextSheetNo(supabase, orgId);
    const { data: inserted, error: insErr } = await supabase
      .from("load_out_sheets")
      .insert({
        organization_id: orgId,
        sheet_no: sheetNo,
        sales_rep_id: salesRepId,
        location_id: locationId,
        sales_date: salesDate,
        status: "draft",
      })
      .select("id")
      .single();
    if (insErr) return { error: insErr.message };
    sheetId = String((inserted as { id: string }).id);
  } else if (String((existingSheet as { status?: string }).status ?? "draft") !== "draft") {
    return { error: "Latest same-day Load Out sheet is already submitted." };
  }

  await supabase
    .from("load_out_sheet_stock_requests")
    .upsert(
      {
        organization_id: orgId,
        load_out_sheet_id: sheetId,
        van_stock_request_id: requestId,
      },
      { onConflict: "load_out_sheet_id,van_stock_request_id" }
    );

  const productIds = lines
    .map((l) => String((l as { product_id?: string | null }).product_id ?? "").trim())
    .filter(Boolean);
  const uniqueProductIds = [...new Set(productIds)];
  const carryLoadOut = await getLatestPriorVanStocksByProduct(supabase, orgId, salesRepId, locationId, salesDate, uniqueProductIds);

  const { data: existingLines } = await supabase
    .from("load_out_sheet_lines")
    .select(
      "product_id, product_code_snapshot, product_name_snapshot, unit, source_request_no, load_out_qty, top_up_qty, second_load_qty, add_req_qty, returns_qty, unit_price, row_no"
    )
    .eq("organization_id", orgId)
    .eq("load_out_sheet_id", sheetId);

  const allProductIds = [...new Set([
    ...uniqueProductIds,
    ...(existingLines ?? []).map((x) => String((x as { product_id?: string | null }).product_id ?? "").trim()).filter(Boolean),
  ])];

  const { data: productsRes } = await supabase
    .from("products")
    .select("id, unit, pack_unit, category")
    .eq("organization_id", orgId)
    .in("id", allProductIds.length > 0 ? allProductIds : [""]);
  const unitByProduct = new Map<string, string>();
  const packUnitByProduct = new Map<string, number>();
  const categoryByProduct = new Map<string, string>();
  for (const p of productsRes ?? []) {
    const id = String((p as { id: string }).id);
    unitByProduct.set(id, String((p as { unit?: string }).unit ?? "CTN"));
    packUnitByProduct.set(id, clamp4(Number((p as { pack_unit?: number | null }).pack_unit ?? 0)));
    categoryByProduct.set(id, String((p as { category?: string | null }).category ?? ""));
  }

  const byProduct = new Map<string, AggLine>();
  let maxRowNo = 0;
  for (const l of existingLines ?? []) {
    const pid = String((l as { product_id?: string | null }).product_id ?? "").trim();
    if (!pid) continue;
    const packUnit = packUnitByProduct.get(pid) ?? 0;
    const category = categoryByProduct.get(pid) ?? "";
    const d = calcDerived({
      load_out_qty: clamp4(Number((l as { load_out_qty?: number }).load_out_qty ?? 0)),
      top_up_qty: clamp4(Number((l as { top_up_qty?: number }).top_up_qty ?? 0)),
      second_load_qty: clamp4(Number((l as { second_load_qty?: number }).second_load_qty ?? 0)),
      returns_qty: clamp4(Number((l as { returns_qty?: number }).returns_qty ?? 0)),
      add_req_qty: clamp4(Number((l as { add_req_qty?: number }).add_req_qty ?? 0)),
      unit_price: clamp4(Number((l as { unit_price?: number }).unit_price ?? 0)),
      category,
      pack_unit: packUnit,
    });
    const rowNo = Number((l as { row_no?: number }).row_no ?? 0) || 0;
    maxRowNo = Math.max(maxRowNo, rowNo);
    byProduct.set(pid, {
      product_id: pid,
      product_code_snapshot: String((l as { product_code_snapshot?: string | null }).product_code_snapshot ?? "") || null,
      product_name_snapshot: String((l as { product_name_snapshot?: string | null }).product_name_snapshot ?? "") || null,
      unit: String((l as { unit?: string | null }).unit ?? "CTN") || "CTN",
      source_request_no: String((l as { source_request_no?: string | null }).source_request_no ?? "") || null,
      load_out_qty: clamp4(Number((l as { load_out_qty?: number }).load_out_qty ?? 0)),
      top_up_qty: clamp4(Number((l as { top_up_qty?: number }).top_up_qty ?? 0)),
      second_load_qty: clamp4(Number((l as { second_load_qty?: number }).second_load_qty ?? 0)),
      add_req_qty: clamp4(Number((l as { add_req_qty?: number }).add_req_qty ?? 0)),
      returns_qty: clamp4(Number((l as { returns_qty?: number }).returns_qty ?? 0)),
      van_stocks_qty: d.vanStocks,
      van_sales_qty: d.vanSales,
      unit_price: clamp4(Number((l as { unit_price?: number }).unit_price ?? 0)),
      sales_value: d.salesValue,
      row_no: rowNo,
    });
  }

  for (const l of lines ?? []) {
    const pid = String((l as { product_id?: string | null }).product_id ?? "").trim();
    if (!pid) continue;
    const qty = clamp4(Number((l as { qty_ctn?: number }).qty_ctn ?? 0));
    if (!qty) continue;
    const existing = byProduct.get(pid);
    const lineUnit = unitByProduct.get(pid) ?? "CTN";
    const linePackUnit = packUnitByProduct.get(pid) ?? 0;
    const base: AggLine =
      existing ??
      {
        product_id: pid,
        product_code_snapshot: String((l as { product_code_snapshot?: string | null }).product_code_snapshot ?? "") || null,
        product_name_snapshot: String((l as { product_name_snapshot?: string | null }).product_name_snapshot ?? "") || null,
        unit: lineUnit,
        source_request_no: null,
        load_out_qty: clamp4(carryLoadOut.get(pid) ?? 0),
        top_up_qty: 0,
        second_load_qty: 0,
        add_req_qty: 0,
        returns_qty: 0,
        van_stocks_qty: 0,
        van_sales_qty: 0,
        unit_price: 0,
        sales_value: 0,
        row_no: maxRowNo + 1,
      };
    if (!existing) maxRowNo += 1;

    if (requestType === "top_up") base.top_up_qty = clamp4(base.top_up_qty + qty);
    else if (requestType === "second_load") base.second_load_qty = clamp4(base.second_load_qty + qty);
    else if (requestType === "returns") base.returns_qty = clamp4(base.returns_qty + qty);
    else if (requestType === "add_request") base.add_req_qty = clamp4(base.add_req_qty + qty);

    if (!base.product_code_snapshot) {
      base.product_code_snapshot = String((l as { product_code_snapshot?: string | null }).product_code_snapshot ?? "") || null;
    }
    if (!base.product_name_snapshot) {
      base.product_name_snapshot = String((l as { product_name_snapshot?: string | null }).product_name_snapshot ?? "") || null;
    }
    base.source_request_no = null;

    const d = calcDerived({ ...base, category: categoryByProduct.get(pid) ?? "", pack_unit: linePackUnit });
    base.van_stocks_qty = d.vanStocks;
    base.van_sales_qty = d.vanSales;
    base.sales_value = d.salesValue;
    byProduct.set(pid, base);
  }

  const rows = [...byProduct.values()].sort((a, b) => a.row_no - b.row_no);
  const saved = await recalcAndPersistSheetLines({ supabase, orgId, sheetId, rows });
  if ("error" in saved) return saved;

  await syncLoadOutHeaderFromVsr(supabase, orgId, sheetId, salesRepId, salesDate, rows.map((r) => r.product_id));

  revalidatePath("/dashboard/sales/load-out-sheets");
  return { ok: true, sheetId };
}

export async function saveLoadOutSheet(formData: FormData) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(formData.get("id") ?? "").trim() || null;
  const salesRepId = String(formData.get("sales_rep_id") ?? "").trim() || null;
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const salesDate = String(formData.get("sales_date") ?? "").trim();
  const vehicleNo = String(formData.get("vehicle_no") ?? "").trim() || null;
  const driverName = String(formData.get("driver_name") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const doSync = String(formData.get("sync_from_requests") ?? "") === "1";

  if (!salesRepId) return { error: "Sales rep is required." };
  if (!locationId) return { error: "Location is required." };
  if (!salesDate) return { error: "Sales date is required." };

  const linkedIds = collectLinkedRequestIds(formData);

  let sheetId = id;
  let sheetNo = String(formData.get("sheet_no") ?? "").trim() || null;

  let existingDailyTarget: number | null = null;
  if (sheetId) {
    const { data: existing } = await supabase
      .from("load_out_sheets")
      .select("id, sheet_no, status, daily_target")
      .eq("id", sheetId)
      .eq("organization_id", orgId)
      .single();
    if (!existing) return { error: "Sheet not found." };
    if (String((existing as { status?: string }).status) !== "draft") {
      return { error: "Only draft sheets can be edited." };
    }
    sheetNo = sheetNo || String((existing as { sheet_no?: string }).sheet_no);
    const dt = (existing as { daily_target?: number | null }).daily_target;
    existingDailyTarget = dt != null ? Number(dt) : null;
  } else {
    sheetNo = sheetNo || (await nextSheetNo(supabase, orgId));
  }

  const headerPayload = {
    organization_id: orgId,
    sheet_no: sheetNo!,
    sales_rep_id: salesRepId,
    location_id: locationId,
    sales_date: salesDate,
    vehicle_no: vehicleNo,
    driver_name: driverName,
    daily_target: sheetId && existingDailyTarget != null && Number.isFinite(existingDailyTarget) ? existingDailyTarget : 0,
    notes,
    status: "draft" as const,
  };

  if (sheetId) {
    const { error: upErr } = await supabase.from("load_out_sheets").update(headerPayload).eq("id", sheetId).eq("organization_id", orgId);
    if (upErr) return { error: upErr.message };
  } else {
    const { data: ins, error: insErr } = await supabase.from("load_out_sheets").insert(headerPayload).select("id").single();
    if (insErr) return { error: insErr.message };
    sheetId = (ins as { id: string }).id;
  }

  await supabase.from("load_out_sheet_stock_requests").delete().eq("load_out_sheet_id", sheetId).eq("organization_id", orgId);
  if (linkedIds.length > 0) {
    const junction = linkedIds.map((van_stock_request_id) => ({
      organization_id: orgId,
      load_out_sheet_id: sheetId,
      van_stock_request_id,
    }));
    const { error: jErr } = await supabase.from("load_out_sheet_stock_requests").insert(junction);
    if (jErr) return { error: jErr.message };
  }

  if (doSync) {
    const sync = await syncLoadOutLinesFromRequests(sheetId);
    if ("error" in sync && sync.error) return sync;
  } else {
    const indexes = collectLineIndexes(formData);
    if (indexes.length > 0) {
      await supabase.from("load_out_sheet_lines").delete().eq("load_out_sheet_id", sheetId).eq("organization_id", orgId);
      let rowNo = 0;
      let totalLoad = 0;
      let totalSales = 0;
      let totalValue = 0;
      const rows: Record<string, unknown>[] = [];
      for (const idx of indexes) {
        const productId = String(formData.get(`line_product_id_${idx}`) ?? "").trim();
        if (!productId) continue;
        rowNo += 1;
        const loadOut = clamp4(parseNum(formData.get(`line_load_out_${idx}`)));
        const topUp = clamp4(parseNum(formData.get(`line_top_up_${idx}`)));
        const secondLoad = clamp4(parseNum(formData.get(`line_second_load_${idx}`)));
        const addReq = clamp4(parseNum(formData.get(`line_add_req_${idx}`)));
        const returns = clamp4(parseNum(formData.get(`line_returns_${idx}`)));
        const price = clamp4(parseNum(formData.get(`line_unit_price_${idx}`)));
        const category = String(formData.get(`line_category_${idx}`) ?? "").trim();
        const packUnit = clamp4(parseNum(formData.get(`line_pack_unit_${idx}`)));
        const d = calcDerived({
          load_out_qty: loadOut,
          top_up_qty: topUp,
          second_load_qty: secondLoad,
          returns_qty: returns,
          add_req_qty: addReq,
          unit_price: price,
          category,
          pack_unit: packUnit,
        });
        const vanSales = d.vanSales;
        const vanStocks = d.vanStocks;
        const salesVal = d.salesValue;
        totalLoad = clamp4(totalLoad + loadOut);
        totalSales = clamp4(totalSales + vanSales);
        totalValue = clamp2(totalValue + salesVal);
        rows.push({
          organization_id: orgId,
          load_out_sheet_id: sheetId,
          product_id: productId,
          product_code_snapshot: String(formData.get(`line_product_code_${idx}`) ?? "").trim() || null,
          product_name_snapshot: String(formData.get(`line_product_name_${idx}`) ?? "").trim() || null,
          unit: String(formData.get(`line_unit_${idx}`) ?? "CTN").trim() || "CTN",
          source_request_no: null,
          load_out_qty: loadOut,
          top_up_qty: topUp,
          second_load_qty: secondLoad,
          add_req_qty: addReq,
          van_stocks_qty: vanStocks,
          van_sales_qty: vanSales,
          returns_qty: returns,
          unit_price: price,
          sales_value: salesVal,
          row_no: rowNo,
        });
      }
      if (rows.length > 0) {
        const { error: lineErr } = await supabase.from("load_out_sheet_lines").insert(rows);
        if (lineErr) return { error: lineErr.message };
      }
      await supabase
        .from("load_out_sheets")
        .update({
          total_loadout_qty: totalLoad,
          total_van_sales_qty: totalSales,
          total_sales_value: totalValue,
        })
        .eq("id", sheetId)
        .eq("organization_id", orgId);
    }
  }

  const { data: linePidRows } = await supabase
    .from("load_out_sheet_lines")
    .select("product_id")
    .eq("load_out_sheet_id", sheetId)
    .eq("organization_id", orgId);
  const uniquePids = [
    ...new Set(
      (linePidRows ?? [])
        .map((r) => String((r as { product_id?: string | null }).product_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  await syncLoadOutHeaderFromVsr(supabase, orgId, sheetId, salesRepId, salesDate, uniquePids);

  revalidatePath("/dashboard/sales/load-out-sheets");
  return { ok: true, id: sheetId };
}

export async function submitLoadOutSheet(sheetId: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const { data: lines } = await supabase
    .from("load_out_sheet_lines")
    .select("id")
    .eq("load_out_sheet_id", sheetId)
    .eq("organization_id", orgId)
    .limit(1);
  if (!lines?.length) return { error: "Add or sync line items before submitting." };

  const { error: upErr } = await supabase
    .from("load_out_sheets")
    .update({ status: "submitted" })
    .eq("id", sheetId)
    .eq("organization_id", orgId)
    .eq("status", "draft");

  if (upErr) return { error: upErr.message };
  revalidatePath("/dashboard/sales/load-out-sheets");
  return { ok: true };
}

export async function deleteLoadOutSheet(sheetId: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const { data: row } = await supabase
    .from("load_out_sheets")
    .select("status")
    .eq("id", sheetId)
    .eq("organization_id", orgId)
    .single();
  if (String((row as { status?: string } | null)?.status) === "submitted") {
    return { error: "Submitted sheets cannot be deleted." };
  }

  await supabase.from("load_out_sheet_lines").delete().eq("load_out_sheet_id", sheetId).eq("organization_id", orgId);
  await supabase.from("load_out_sheet_stock_requests").delete().eq("load_out_sheet_id", sheetId).eq("organization_id", orgId);
  const { error: delErr } = await supabase.from("load_out_sheets").delete().eq("id", sheetId).eq("organization_id", orgId);
  if (delErr) return { error: delErr.message };

  revalidatePath("/dashboard/sales/load-out-sheets");
  return { ok: true };
}
