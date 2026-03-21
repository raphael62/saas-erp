"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { applyApprovedStockRequestToLoadOut } from "@/app/dashboard/sales/load-out-sheets/actions";

type LineInput = {
  row_no: number;
  product_id: string | null;
  product_code_snapshot: string | null;
  product_name_snapshot: string | null;
  qty_ctn: number;
};

async function getOrgContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, orgId: null as string | null, userId: null as string | null, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id?: string } | null)?.organization_id ?? null;
  if (!orgId) return { supabase, orgId: null as string | null, userId: user.id, error: "No organization" };

  return { supabase, orgId, userId: user.id, error: null as string | null };
}

function parseNum(v: FormDataEntryValue | null) {
  const raw = String(v ?? "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function clamp4(n: number) {
  return Number(n.toFixed(4));
}

function collectLineIndexes(formData: FormData) {
  const ix = new Set<string>();
  for (const [k] of formData.entries()) {
    if (k.startsWith("line_product_id_")) ix.add(k.replace("line_product_id_", ""));
  }
  return Array.from(ix).sort((a, b) => Number(a) - Number(b));
}

function collectLines(formData: FormData): LineInput[] {
  const out: LineInput[] = [];
  for (const idx of collectLineIndexes(formData)) {
    const productId = String(formData.get(`line_product_id_${idx}`) ?? "").trim() || null;
    const code = String(formData.get(`line_product_code_${idx}`) ?? "").trim() || null;
    const name = String(formData.get(`line_product_name_${idx}`) ?? "").trim() || null;
    const qty = clamp4(parseNum(formData.get(`line_qty_ctn_${idx}`)));
    if (!productId && !qty) continue;
    if (!productId) continue;
    out.push({
      row_no: Number(idx) || 0,
      product_id: productId,
      product_code_snapshot: code,
      product_name_snapshot: name,
      qty_ctn: qty,
    });
  }
  return out;
}

async function nextRequestNo(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string) {
  const { data } = await supabase
    .from("van_stock_requests")
    .select("request_no")
    .eq("organization_id", orgId)
    .ilike("request_no", "VSR-%")
    .order("request_no", { ascending: false })
    .limit(1);
  const latest = String(data?.[0]?.request_no ?? "");
  const m = latest.match(/^VSR-(\d+)$/i);
  const n = m ? parseInt(m[1], 10) + 1 : 1;
  return `VSR-${String(n).padStart(5, "0")}`;
}

export async function getSuggestedVanStockRequestNo() {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };
  const requestNo = await nextRequestNo(supabase, orgId);
  return { ok: true, requestNo };
}

export async function saveVanStockRequest(formData: FormData) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(formData.get("id") ?? "").trim() || null;
  const salesRepId = String(formData.get("sales_rep_id") ?? "").trim() || null;
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const requestDate = String(formData.get("request_date") ?? "").trim();
  const neededFor = String(formData.get("needed_for_date") ?? "").trim() || null;
  const requestType = String(formData.get("request_type") ?? "top_up").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const allowedTypes = new Set(["top_up", "second_load", "returns", "add_request"]);
  if (!allowedTypes.has(requestType)) return { error: "Invalid request type." };
  if (!salesRepId) return { error: "Sales rep is required." };
  if (!locationId) return { error: "Location is required." };
  if (!requestDate) return { error: "Request date is required." };

  const lines = collectLines(formData);
  if (lines.length === 0) return { error: "Add at least one product line." };

  const totalQty = clamp4(lines.reduce((s, l) => s + l.qty_ctn, 0));
  const totalItems = lines.length;

  let requestId = id;
  let requestNo = String(formData.get("request_no") ?? "").trim() || null;

  if (requestId) {
    const { data: existing } = await supabase
      .from("van_stock_requests")
      .select("id, request_no, status")
      .eq("organization_id", orgId)
      .eq("id", requestId)
      .single();
    if (!existing) return { error: "Request not found." };
    const st = String((existing as { status?: string }).status ?? "");
    if (st !== "draft" && st !== "rejected") {
      return { error: "Only draft or rejected requests can be edited." };
    }
    requestNo = requestNo || String((existing as { request_no?: string }).request_no);
  } else {
    requestNo = requestNo || (await nextRequestNo(supabase, orgId));
  }

  const payload = {
    organization_id: orgId,
    request_no: requestNo!,
    sales_rep_id: salesRepId,
    location_id: locationId,
    request_date: requestDate,
    needed_for_date: neededFor || null,
    request_type: requestType,
    notes,
    total_items: totalItems,
    total_qty: totalQty,
    status: "draft",
    updated_at: new Date().toISOString(),
  };

  if (requestId) {
    const { error: upErr } = await supabase.from("van_stock_requests").update(payload).eq("id", requestId).eq("organization_id", orgId);
    if (upErr) return { error: upErr.message };
  } else {
    const { data: ins, error: insErr } = await supabase.from("van_stock_requests").insert(payload).select("id").single();
    if (insErr) return { error: insErr.message };
    requestId = (ins as { id: string }).id;
  }

  await supabase.from("van_stock_request_lines").delete().eq("van_stock_request_id", requestId).eq("organization_id", orgId);

  const lineRows = lines.map((l) => ({
    organization_id: orgId,
    van_stock_request_id: requestId,
    product_id: l.product_id,
    product_code_snapshot: l.product_code_snapshot,
    product_name_snapshot: l.product_name_snapshot,
    qty_ctn: l.qty_ctn,
    row_no: l.row_no,
  }));

  const { error: lineErr } = await supabase.from("van_stock_request_lines").insert(lineRows);
  if (lineErr) return { error: lineErr.message };

  revalidatePath("/dashboard/sales/van-stock-requests");
  return { ok: true, id: requestId };
}

export async function submitVanStockRequestForApproval(formData: FormData) {
  const save = await saveVanStockRequest(formData);
  if ("error" in save && save.error) return save;
  const id = "id" in save ? save.id : null;
  if (!id) return { error: "Save failed." };

  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const { error: upErr } = await supabase
    .from("van_stock_requests")
    .update({
      status: "pending_approval",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", orgId);

  if (upErr) return { error: upErr.message };
  revalidatePath("/dashboard/sales/van-stock-requests");
  return { ok: true, id };
}

export async function setVanStockRequestStatus(
  requestId: string,
  status: "approved" | "rejected"
) {
  const { supabase, orgId, userId, error } = await getOrgContext();
  if (error || !orgId || !userId) return { error: error ?? "Unauthorized" };

  const { error: upErr } = await supabase
    .from("van_stock_requests")
    .update({
      status,
      approved_at: new Date().toISOString(),
      approved_by: userId,
    })
    .eq("id", requestId)
    .eq("organization_id", orgId)
    .eq("status", "pending_approval");

  if (upErr) return { error: upErr.message };

  if (status === "approved") {
    const syncRes = await applyApprovedStockRequestToLoadOut(requestId);
    if ("error" in syncRes && syncRes.error) {
      return { error: `Request approved, but Load Out automation failed: ${syncRes.error}` };
    }
  }

  revalidatePath("/dashboard/sales/van-stock-requests");
  revalidatePath("/dashboard/sales/load-out-sheets");
  return { ok: true };
}

export async function deleteVanStockRequest(requestId: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const { data: row } = await supabase
    .from("van_stock_requests")
    .select("status")
    .eq("id", requestId)
    .eq("organization_id", orgId)
    .single();
  const st = String((row as { status?: string } | null)?.status ?? "");
  if (st === "approved") return { error: "Approved requests cannot be deleted." };

  await supabase.from("van_stock_request_lines").delete().eq("van_stock_request_id", requestId).eq("organization_id", orgId);
  const { error: delErr } = await supabase.from("van_stock_requests").delete().eq("id", requestId).eq("organization_id", orgId);
  if (delErr) return { error: delErr.message };

  revalidatePath("/dashboard/sales/van-stock-requests");
  return { ok: true };
}
