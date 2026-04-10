"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildStockCheckSnapshot } from "@/lib/stock-check-snapshot";

function normalizeDate(input: string | null | undefined) {
  return String(input ?? "").slice(0, 10);
}

function clamp2(value: number) {
  return Number(value.toFixed(2));
}

async function getOrgContext() {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { supabase: ctx.supabase, orgId: null as string | null, userId: ctx.userId ?? null, error: ctx.error };
  return { supabase: ctx.supabase, orgId: ctx.orgId, userId: ctx.userId, error: null as string | null };
}

async function generateSheetNo(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, dateIso: string) {
  const prefix = normalizeDate(dateIso) || new Date().toISOString().slice(0, 10);
  const like = `SC-${prefix}-%`;

  const { data } = await supabase
    .from("stock_count_sheets")
    .select("sheet_no")
    .eq("organization_id", orgId)
    .ilike("sheet_no", like)
    .order("sheet_no", { ascending: false })
    .limit(1);

  const last = String((data?.[0] as { sheet_no?: string } | undefined)?.sheet_no ?? "");
  const suffix = last.startsWith(`SC-${prefix}-`) ? Number(last.slice(`SC-${prefix}-`.length)) || 0 : 0;
  return `SC-${prefix}-${String(suffix + 1).padStart(3, "0")}`;
}

export async function getSuggestedStockCountSheetNo(countDateInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const countDate = normalizeDate(countDateInput);
  if (!countDate) return { error: "Count date is required." };

  const sheet_no = await generateSheetNo(supabase, orgId, countDate);
  return { ok: true, sheet_no };
}

export type SaveStockCountSheetInput = {
  id?: string;
  count_date: string;
  location_id: string;
  notes?: string;
  lines: Array<{
    product_id: string;
    cartons: number;
    bottles: number;
    ctn_qty: number;
    notes?: string;
    row_no: number;
  }>;
};

export async function saveStockCountSheet(input: SaveStockCountSheetInput) {
  const { supabase, orgId, userId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(input.id ?? "").trim();
  const count_date = normalizeDate(input.count_date);
  const location_id = String(input.location_id ?? "").trim();
  const notes = String(input.notes ?? "").trim() || null;
  const lines = (input.lines ?? [])
    .map((l) => ({
      product_id: String(l.product_id ?? "").trim(),
      cartons: clamp2(Number(l.cartons ?? 0)),
      bottles: clamp2(Number(l.bottles ?? 0)),
      ctn_qty: Number(Number(l.ctn_qty ?? 0).toFixed(4)),
      notes: String(l.notes ?? "").trim() || null,
      row_no: Number(l.row_no ?? 0),
    }))
    .filter((l) => l.product_id && l.ctn_qty > 0);

  if (!count_date) return { error: "Count date is required." };
  if (!location_id) return { error: "Location is required." };
  if (lines.length === 0) return { error: "At least one valid line item is required." };

  const payload = {
    count_date,
    location_id,
    notes,
  };

  let savedSheetId = "";

  if (id) {
    savedSheetId = id;
    const { error: updateErr } = await supabase
      .from("stock_count_sheets")
      .update(payload)
      .eq("id", id)
      .eq("organization_id", orgId);
    if (updateErr) return { error: updateErr.message };

    const { error: deleteLinesErr } = await supabase
      .from("stock_count_lines")
      .delete()
      .eq("organization_id", orgId)
      .eq("stock_count_sheet_id", id);
    if (deleteLinesErr) return { error: deleteLinesErr.message };

    const { error: insertLinesErr } = await supabase.from("stock_count_lines").insert(
      lines.map((l) => ({
        organization_id: orgId,
        stock_count_sheet_id: id,
        ...l,
      }))
    );
    if (insertLinesErr) return { error: insertLinesErr.message };
  } else {
    const sheet_no = await generateSheetNo(supabase, orgId, count_date);
    const { data: inserted, error: insertErr } = await supabase
      .from("stock_count_sheets")
      .insert({
        organization_id: orgId,
        sheet_no,
        ...payload,
        created_by: userId,
      })
      .select("id")
      .single();
    if (insertErr) return { error: insertErr.message };

    const sheetId = String((inserted as { id?: string } | null)?.id ?? "");
    if (!sheetId) return { error: "Failed to create stock count sheet." };
    savedSheetId = sheetId;

    const { error: insertLinesErr } = await supabase.from("stock_count_lines").insert(
      lines.map((l) => ({
        organization_id: orgId,
        stock_count_sheet_id: sheetId,
        ...l,
      }))
    );
    if (insertLinesErr) return { error: insertLinesErr.message };
  }

  const snap = await buildStockCheckSnapshot(supabase, orgId, savedSheetId);
  if (snap.error) {
    return { error: `Stock count saved but stock check could not be generated: ${snap.error}` };
  }

  revalidatePath("/dashboard/inventory/stock-count-sheets");
  revalidatePath("/dashboard/inventory/stock-checks");
  revalidatePath("/dashboard/inventory/stocks-by-location");
  revalidatePath("/dashboard/inventory");
  return { ok: true, id: savedSheetId };
}

export async function deleteStockCountSheet(idInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(idInput ?? "").trim();
  if (!id) return { error: "Sheet ID is required." };

  const { error: deleteErr } = await supabase
    .from("stock_count_sheets")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (deleteErr) return { error: deleteErr.message };
  revalidatePath("/dashboard/inventory/stock-count-sheets");
  revalidatePath("/dashboard/inventory/stock-checks");
  revalidatePath("/dashboard/inventory/stocks-by-location");
  revalidatePath("/dashboard/inventory");
  return { ok: true };
}
