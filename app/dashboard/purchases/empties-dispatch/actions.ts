"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type DispatchLineInput = {
  row_no: number;
  product_id: string | null;
  product_code_snapshot: string | null;
  product_name_snapshot: string | null;
  empties_type: string | null;
  qty: number;
  unit_price: number;
  total_value: number;
};

async function getOrgContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, orgId: null as string | null, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id?: string } | null)?.organization_id ?? null;
  if (!orgId) return { supabase, orgId: null as string | null, error: "No organization" };
  return { supabase, orgId, error: null as string | null };
}

function parseNumber(value: FormDataEntryValue | null, fallback = 0) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return fallback;
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

function clamp2(value: number) {
  return Number(value.toFixed(2));
}

function clamp4(value: number) {
  return Number(value.toFixed(4));
}

function collectLineIndexes(formData: FormData) {
  const indexes = new Set<string>();
  for (const [key] of formData.entries()) {
    if (key.startsWith("line_product_id_")) indexes.add(key.replace("line_product_id_", ""));
    else if (key.startsWith("line_product_name_")) indexes.add(key.replace("line_product_name_", ""));
  }
  return Array.from(indexes).sort((a, b) => Number(a) - Number(b));
}

function collectLines(formData: FormData): DispatchLineInput[] {
  const lines: DispatchLineInput[] = [];
  const indexes = collectLineIndexes(formData);
  for (const idx of indexes) {
    const productId = String(formData.get(`line_product_id_${idx}`) ?? "").trim() || null;
    const code = String(formData.get(`line_product_code_${idx}`) ?? "").trim() || null;
    const name = String(formData.get(`line_product_name_${idx}`) ?? "").trim() || null;
    const emptiesType = String(formData.get(`line_empties_type_${idx}`) ?? "").trim() || null;
    const qty = clamp4(parseNumber(formData.get(`line_qty_${idx}`), 0));
    const unitPrice = clamp2(parseNumber(formData.get(`line_unit_price_${idx}`), 0));
    const totalValue = clamp2(parseNumber(formData.get(`line_total_value_${idx}`), qty * unitPrice));
    const hasData = productId || name || qty > 0 || unitPrice > 0 || totalValue > 0;
    if (!hasData) continue;
    lines.push({
      row_no: Number(idx) || 0,
      product_id: productId,
      product_code_snapshot: code,
      product_name_snapshot: name,
      empties_type: emptiesType,
      qty,
      unit_price: unitPrice,
      total_value: totalValue,
    });
  }
  return lines;
}

function aggregateProductQty(lines: Array<{ product_id: string | null; qty?: number | null }>) {
  const out = new Map<string, number>();
  for (const line of lines) {
    if (!line.product_id) continue;
    const qty = clamp4(Number(line.qty ?? 0));
    if (!qty) continue;
    out.set(String(line.product_id), clamp4((out.get(String(line.product_id)) ?? 0) + qty));
  }
  return out;
}

function subtractMaps(a: Map<string, number>, b: Map<string, number>) {
  const out = new Map<string, number>();
  const keys = new Set<string>([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    const diff = clamp4((a.get(key) ?? 0) - (b.get(key) ?? 0));
    if (diff !== 0) out.set(key, diff);
  }
  return out;
}

async function applyStockDelta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  deltaByProduct: Map<string, number>
) {
  for (const [productId, deltaQty] of deltaByProduct.entries()) {
    if (!deltaQty) continue;
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, stock_quantity")
      .eq("organization_id", orgId)
      .eq("id", productId)
      .single();
    if (productError || !product) return { error: `Product not found for stock update (${productId}).` };

    const currentStock = Number(product.stock_quantity ?? 0);
    const nextStock = clamp2(currentStock + deltaQty);
    const { error: stockError } = await supabase
      .from("products")
      .update({ stock_quantity: nextStock })
      .eq("organization_id", orgId)
      .eq("id", productId);
    if (stockError) return { error: stockError.message };
  }
  return { ok: true };
}

async function generateDispatchNo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  datePrefix: string
) {
  const prefix = `${datePrefix}-`;
  const { data } = await supabase
    .from("empties_dispatches")
    .select("dispatch_no")
    .eq("organization_id", orgId)
    .ilike("dispatch_no", `${prefix}%`)
    .order("dispatch_no", { ascending: false })
    .limit(1);
  const latest = data?.[0]?.dispatch_no ?? "";
  const latestSuffix = latest.startsWith(prefix) ? latest.slice(prefix.length) : "";
  const seq = Number(latestSuffix) || 0;
  return `${prefix}${String(seq + 1).padStart(3, "0")}`;
}

export async function getSuggestedDispatchNo(datePrefix: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };
  const normalized = String(datePrefix ?? "").slice(0, 10);
  if (!normalized) return { error: "Dispatch date is required." };
  const dispatchNo = await generateDispatchNo(supabase, orgId, normalized);
  return { ok: true, dispatchNo };
}

export async function saveEmptiesDispatch(formData: FormData) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(formData.get("id") ?? "").trim() || null;
  const supplierId = String(formData.get("supplier_id") ?? "").trim() || null;
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const dispatchNoInput = String(formData.get("dispatch_no") ?? "").trim() || null;
  const dispatchDate = String(formData.get("dispatch_date") ?? "").trim();
  const creditNoteDate = String(formData.get("credit_note_date") ?? "").trim() || null;
  const dispatchNoteNo = String(formData.get("dispatch_note_no") ?? "").trim() || null;
  const creditNoteNo = String(formData.get("credit_note_no") ?? "").trim() || null;
  const poNumber = String(formData.get("po_number") ?? "").trim() || null;
  const deliveryNote = String(formData.get("delivery_note") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!supplierId) return { error: "Supplier is required." };
  if (!dispatchDate) return { error: "Dispatch date is required." };
  if (!locationId) return { error: "Location is required." };

  const lines = collectLines(formData);
  if (lines.length === 0) return { error: "Add at least one line item." };
  if (lines.some((line) => !line.product_id)) return { error: "Each line must have a valid product." };

  const totalQty = clamp4(lines.reduce((sum, line) => sum + line.qty, 0));
  const totalValue = clamp2(lines.reduce((sum, line) => sum + line.total_value, 0));

  let dispatchId = id;
  let dispatchNo = dispatchNoInput;
  let previousLines: Array<{ product_id: string | null; qty?: number | null }> = [];

  if (dispatchId) {
    const { data: existing } = await supabase
      .from("empties_dispatches")
      .select("id, dispatch_no")
      .eq("organization_id", orgId)
      .eq("id", dispatchId)
      .single();
    if (!existing) return { error: "Dispatch not found." };
    dispatchNo = dispatchNo || existing.dispatch_no;

    const previousRes = await supabase
      .from("empties_dispatch_lines")
      .select("product_id, qty")
      .eq("organization_id", orgId)
      .eq("empties_dispatch_id", dispatchId);
    if (previousRes.error) return { error: previousRes.error.message };
    previousLines = previousRes.data ?? [];

    const { error: updateError } = await supabase
      .from("empties_dispatches")
      .update({
        dispatch_no: dispatchNo,
        supplier_id: supplierId,
        location_id: locationId,
        dispatch_date: dispatchDate,
        credit_note_date: creditNoteDate,
        dispatch_note_no: dispatchNoteNo,
        credit_note_no: creditNoteNo,
        po_number: poNumber,
        delivery_note: deliveryNote,
        notes,
        total_qty: totalQty,
        total_value: totalValue,
      })
      .eq("organization_id", orgId)
      .eq("id", dispatchId);
    if (updateError) return { error: updateError.message };
  } else {
    if (!dispatchNo) dispatchNo = await generateDispatchNo(supabase, orgId, dispatchDate.slice(0, 10));

    const { data: inserted, error: insertError } = await supabase
      .from("empties_dispatches")
      .insert({
        organization_id: orgId,
        dispatch_no: dispatchNo,
        supplier_id: supplierId,
        location_id: locationId,
        dispatch_date: dispatchDate,
        credit_note_date: creditNoteDate,
        dispatch_note_no: dispatchNoteNo,
        credit_note_no: creditNoteNo,
        po_number: poNumber,
        delivery_note: deliveryNote,
        notes,
        total_qty: totalQty,
        total_value: totalValue,
      })
      .select("id")
      .single();
    if (insertError) return { error: insertError.message };
    dispatchId = inserted?.id ?? null;
    if (!dispatchId) return { error: "Failed to create empties dispatch." };
  }

  const { error: clearError } = await supabase
    .from("empties_dispatch_lines")
    .delete()
    .eq("organization_id", orgId)
    .eq("empties_dispatch_id", dispatchId);
  if (clearError) return { error: clearError.message };

  const rows = lines.map((line) => ({
    organization_id: orgId,
    empties_dispatch_id: dispatchId!,
    product_id: line.product_id,
    product_code_snapshot: line.product_code_snapshot,
    product_name_snapshot: line.product_name_snapshot,
    empties_type: line.empties_type,
    qty: line.qty,
    unit_price: line.unit_price,
    total_value: line.total_value,
    row_no: line.row_no,
  }));
  const { error: insertLinesError } = await supabase.from("empties_dispatch_lines").insert(rows);
  if (insertLinesError) return { error: insertLinesError.message };

  const prevOut = aggregateProductQty(previousLines);
  const nextOut = aggregateProductQty(lines);
  const stockDelta = subtractMaps(prevOut, nextOut);
  const stockResult = await applyStockDelta(supabase, orgId, stockDelta);
  if ("error" in stockResult && stockResult.error) return { error: stockResult.error };

  revalidatePath("/dashboard/purchases/empties-dispatch");
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/inventory/stocks-by-location");
  return { ok: true, id: dispatchId };
}

export async function deleteEmptiesDispatch(id: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const dispatchId = String(id ?? "").trim();
  if (!dispatchId) return { error: "Missing dispatch id." };

  const { data: existing } = await supabase
    .from("empties_dispatches")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", dispatchId)
    .single();
  if (!existing) return { error: "Dispatch not found." };

  const previousRes = await supabase
    .from("empties_dispatch_lines")
    .select("product_id, qty")
    .eq("organization_id", orgId)
    .eq("empties_dispatch_id", dispatchId);
  if (previousRes.error) return { error: previousRes.error.message };
  const previousLines = previousRes.data ?? [];

  const { error: lineDeleteError } = await supabase
    .from("empties_dispatch_lines")
    .delete()
    .eq("organization_id", orgId)
    .eq("empties_dispatch_id", dispatchId);
  if (lineDeleteError) return { error: lineDeleteError.message };

  const { error: deleteError } = await supabase
    .from("empties_dispatches")
    .delete()
    .eq("organization_id", orgId)
    .eq("id", dispatchId);
  if (deleteError) return { error: deleteError.message };

  const restoreDelta = aggregateProductQty(previousLines);
  const stockResult = await applyStockDelta(supabase, orgId, restoreDelta);
  if ("error" in stockResult && stockResult.error) return { error: stockResult.error };

  revalidatePath("/dashboard/purchases/empties-dispatch");
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/inventory/stocks-by-location");
  return { ok: true };
}
