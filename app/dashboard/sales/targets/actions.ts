"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv";

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

export async function saveSSRMonthlyTarget(formData: FormData) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(formData.get("id") ?? "").trim() || null;
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
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

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
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(formData.get("id") ?? "").trim() || null;
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
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

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

function rowVal(row: SimpleRow, keys: string[]) {
  for (const k of keys) {
    const v = String(row[k] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function lower(v: string) {
  return v.trim().toLowerCase();
}

export async function importSSRMonthlyTargetsCsv(formData: FormData) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "CSV file is required" };
  const rows = parseCsv(await file.text()) as SimpleRow[];
  if (rows.length === 0) return { error: "CSV has no data rows" };

  const repsRes = await supabase.from("sales_reps").select("id, code, name").eq("organization_id", orgId);
  const reps = repsRes.error ? [] : repsRes.data ?? [];

  const repById = new Map<string, string>();
  const repByCode = new Map<string, string>();
  const repByName = new Map<string, string>();
  for (const r of reps as Array<{ id: string; code?: string | null; name?: string | null }>) {
    repById.set(String(r.id), String(r.id));
    if (r.code) repByCode.set(lower(String(r.code)), String(r.id));
    if (r.name) repByName.set(lower(String(r.name)), String(r.id));
  }

  let imported = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const repToken = rowVal(row, ["sales_rep_id", "sales_rep_code", "sales_rep_name", "sales_rep", "rep_code"]);
    const repId = repById.get(repToken) || repByCode.get(lower(repToken)) || repByName.get(lower(repToken));
    if (!repId) return { error: `Row ${i + 2}: Could not resolve sales rep.` };

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
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "CSV file is required" };
  const rows = parseCsv(await file.text()) as SimpleRow[];
  if (rows.length === 0) return { error: "CSV has no data rows" };

  const repsRes = await supabase.from("sales_reps").select("id, code, name").eq("organization_id", orgId);
  const reps = repsRes.error ? [] : repsRes.data ?? [];
  const productsRes = await supabase.from("products").select("id, code, name").eq("organization_id", orgId);
  const products = productsRes.error ? [] : productsRes.data ?? [];

  const repById = new Map<string, string>();
  const repByCode = new Map<string, string>();
  const repByName = new Map<string, string>();
  for (const r of reps as Array<{ id: string; code?: string | null; name?: string | null }>) {
    repById.set(String(r.id), String(r.id));
    if (r.code) repByCode.set(lower(String(r.code)), String(r.id));
    if (r.name) repByName.set(lower(String(r.name)), String(r.id));
  }

  const productById = new Map<string, string>();
  const productByCode = new Map<string, string>();
  const productByName = new Map<string, string>();
  for (const p of products as Array<{ id: string | number; code?: string | null; name?: string | null }>) {
    const pid = String(p.id);
    productById.set(pid, pid);
    if (p.code) productByCode.set(lower(String(p.code)), pid);
    if (p.name) productByName.set(lower(String(p.name)), pid);
  }

  const grouped = new Map<
    string,
    {
      sales_rep_id: string;
      month_start: string;
      commission_pct: number;
      notes: string | null;
      lines: Map<string, { qty: number; value: number }>;
    }
  >();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const repToken = rowVal(row, ["sales_rep_id", "sales_rep_code", "sales_rep_name", "sales_rep", "rep_code"]);
    const repId = repById.get(repToken) || repByCode.get(lower(repToken)) || repByName.get(lower(repToken));
    if (!repId) return { error: `Row ${i + 2}: Could not resolve sales rep.` };

    const monthStart = toMonthStart(rowVal(row, ["month_start", "month", "target_month"]));
    if (!monthStart) return { error: `Row ${i + 2}: month_start/month is required.` };

    const productToken = rowVal(row, ["product_id", "product_code", "product_name"]);
    const productId =
      productById.get(productToken) || productByCode.get(lower(productToken)) || productByName.get(lower(productToken));
    if (!productId) return { error: `Row ${i + 2}: Could not resolve product.` };

    const key = `${repId}__${monthStart}`;
    const current =
      grouped.get(key) ??
      {
        sales_rep_id: repId,
        month_start: monthStart,
        commission_pct: 0,
        notes: null as string | null,
        lines: new Map<string, { qty: number; value: number }>(),
      };

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
    const { data: head, error: headErr } = await supabase
      .from("sales_vsr_monthly_targets")
      .upsert(
        {
          organization_id: orgId,
          sales_rep_id: entry.sales_rep_id,
          month_start: entry.month_start,
          commission_pct: entry.commission_pct,
          notes: entry.notes,
        },
        { onConflict: "organization_id,sales_rep_id,month_start" }
      )
      .select("id")
      .single();
    if (headErr) return { error: headErr.message };

    const targetId = String((head as { id: string }).id);
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
