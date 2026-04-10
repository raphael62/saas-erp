import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function n(v: unknown): number {
  return Number(v ?? 0);
}

type LoadOutSheetRow = {
  id: string;
  sales_rep_id: string | null;
  sales_date: string;
  created_at: string;
};

/** Latest load-out per sales rep at location with sales_date ≤ countDate; tie-break created_at desc, then id. */
function pickLatestLoadOutPerRep(rows: LoadOutSheetRow[]): Map<string, LoadOutSheetRow> {
  const byRep = new Map<string, LoadOutSheetRow>();
  for (const r of rows) {
    const rep = r.sales_rep_id ? String(r.sales_rep_id) : "";
    if (!rep) continue;
    const ex = byRep.get(rep);
    if (!ex) {
      byRep.set(rep, r);
      continue;
    }
    const sd = String(r.sales_date ?? "").slice(0, 10);
    const exd = String(ex.sales_date ?? "").slice(0, 10);
    const cmp = sd.localeCompare(exd);
    if (cmp > 0) {
      byRep.set(rep, r);
    } else if (cmp === 0) {
      const c1 = new Date(r.created_at).getTime();
      const c2 = new Date(ex.created_at).getTime();
      if (c1 > c2) byRep.set(rep, r);
      else if (c1 === c2 && String(r.id) > String(ex.id)) byRep.set(rep, r);
    }
  }
  return byRep;
}

/**
 * Builds or replaces the stock_check for a stock count sheet: van (van_stocks_qty, latest per rep),
 * counted ctn, system location balance, combined, variance.
 */
export async function buildStockCheckSnapshot(
  supabase: Supabase,
  orgId: string,
  stockCountSheetId: string
): Promise<{ error?: string }> {
  const { data: sheet, error: sheetErr } = await supabase
    .from("stock_count_sheets")
    .select("id, count_date, location_id, organization_id")
    .eq("id", stockCountSheetId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (sheetErr) return { error: sheetErr.message };
  if (!sheet) return { error: "Stock count sheet not found." };

  const countDate = String((sheet as { count_date?: string }).count_date ?? "").slice(0, 10);
  const locationId = String((sheet as { location_id?: string }).location_id ?? "");
  if (!countDate || !locationId) return { error: "Stock count sheet is missing date or location." };

  const { data: countLines, error: lineErr } = await supabase
    .from("stock_count_lines")
    .select("product_id, ctn_qty, row_no, notes")
    .eq("organization_id", orgId)
    .eq("stock_count_sheet_id", stockCountSheetId)
    .order("row_no", { ascending: true });

  if (lineErr) return { error: lineErr.message };

  const countedByProduct = new Map<string, { ctn: number; row_no: number; notes: string | null }>();
  for (const ln of countLines ?? []) {
    const pid = String((ln as { product_id?: string }).product_id ?? "").trim();
    if (!pid) continue;
    countedByProduct.set(pid, {
      ctn: n((ln as { ctn_qty?: unknown }).ctn_qty),
      row_no: n((ln as { row_no?: unknown }).row_no),
      notes: (ln as { notes?: string | null }).notes ?? null,
    });
  }

  const { data: loadSheetsRaw, error: loErr } = await supabase
    .from("load_out_sheets")
    .select("id, sales_rep_id, sales_date, created_at")
    .eq("organization_id", orgId)
    .eq("location_id", locationId)
    .lte("sales_date", countDate);

  if (loErr) return { error: loErr.message };

  const loadSheets = (loadSheetsRaw ?? []).filter((r) => (r as { sales_rep_id?: string | null }).sales_rep_id != null);
  const bestByRep = pickLatestLoadOutPerRep(loadSheets as LoadOutSheetRow[]);
  const sheetIds = [...bestByRep.values()].map((r) => r.id);

  const vanByProduct = new Map<string, number>();
  const vanMeta: Array<{ sales_rep_id: string; sales_date: string; load_out_sheet_id: string }> = [];

  for (const [, row] of bestByRep) {
    vanMeta.push({
      sales_rep_id: String(row.sales_rep_id ?? ""),
      sales_date: String(row.sales_date ?? "").slice(0, 10),
      load_out_sheet_id: row.id,
    });
  }

  if (sheetIds.length > 0) {
    const { data: loLines, error: lolErr } = await supabase
      .from("load_out_sheet_lines")
      .select("load_out_sheet_id, product_id, van_stocks_qty")
      .eq("organization_id", orgId)
      .in("load_out_sheet_id", sheetIds);

    if (lolErr) return { error: lolErr.message };

    for (const ln of loLines ?? []) {
      const pid = String((ln as { product_id?: string | null }).product_id ?? "").trim();
      if (!pid) continue;
      const v = n((ln as { van_stocks_qty?: unknown }).van_stocks_qty);
      vanByProduct.set(pid, (vanByProduct.get(pid) ?? 0) + v);
    }
  }

  const productIds = new Set<string>([...countedByProduct.keys(), ...vanByProduct.keys()]);
  if (productIds.size === 0) {
    return { error: "No products to include in stock check." };
  }

  const balanceByProduct = new Map<string, number>();
  const { data: balances, error: balErr } = await supabase
    .from("inventory_location_balances")
    .select("product_id, quantity")
    .eq("organization_id", orgId)
    .eq("location_id", locationId)
    .in("product_id", [...productIds]);

  if (balErr) return { error: balErr.message };
  for (const b of balances ?? []) {
    const pid = String((b as { product_id?: string }).product_id ?? "");
    balanceByProduct.set(pid, n((b as { quantity?: unknown }).quantity));
  }

  await supabase.from("stock_checks").delete().eq("stock_count_sheet_id", stockCountSheetId).eq("organization_id", orgId);

  const { data: inserted, error: insErr } = await supabase
    .from("stock_checks")
    .insert({
      organization_id: orgId,
      stock_count_sheet_id: stockCountSheetId,
      count_date: countDate,
      location_id: locationId,
      van_last_sales_dates: vanMeta.length ? vanMeta : null,
    })
    .select("id")
    .single();

  if (insErr) return { error: insErr.message };
  const stockCheckId = String((inserted as { id?: string } | null)?.id ?? "");
  if (!stockCheckId) return { error: "Failed to create stock check." };

  const rows: Array<{
    organization_id: string;
    stock_check_id: string;
    product_id: string;
    van_qty: number;
    counted_qty: number;
    system_location_qty: number;
    combined_qty: number;
    variance_qty: number;
    row_no: number;
    line_notes: string | null;
  }> = [];

  let rowNo = 0;
  const sorted = [...productIds].sort((a, b) => {
    const ar = countedByProduct.get(a)?.row_no ?? 999999;
    const br = countedByProduct.get(b)?.row_no ?? 999999;
    if (ar !== br) return ar - br;
    return a.localeCompare(b);
  });

  for (const pid of sorted) {
    const van = vanByProduct.get(pid) ?? 0;
    const counted = countedByProduct.get(pid)?.ctn ?? 0;
    const sys = balanceByProduct.get(pid) ?? 0;
    const combined = van + counted;
    const variance = combined - sys;
    const notes = countedByProduct.get(pid)?.notes ?? null;
    rowNo += 1;
    rows.push({
      organization_id: orgId,
      stock_check_id: stockCheckId,
      product_id: pid,
      van_qty: Number(van.toFixed(4)),
      counted_qty: Number(counted.toFixed(4)),
      system_location_qty: Number(sys.toFixed(4)),
      combined_qty: Number(combined.toFixed(4)),
      variance_qty: Number(variance.toFixed(4)),
      row_no: rowNo,
      line_notes: notes,
    });
  }

  const { error: linesInsErr } = await supabase.from("stock_check_lines").insert(rows);
  if (linesInsErr) return { error: linesInsErr.message };

  return {};
}
