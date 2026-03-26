"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

async function generateTransferNo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  dateIso: string
) {
  const prefix = normalizeDate(dateIso) || new Date().toISOString().slice(0, 10);
  const like = `ST-${prefix}-%`;

  const { data } = await supabase
    .from("location_transfers")
    .select("transfer_no")
    .eq("organization_id", orgId)
    .ilike("transfer_no", like)
    .order("transfer_no", { ascending: false })
    .limit(1);

  const last = String((data?.[0] as { transfer_no?: string } | undefined)?.transfer_no ?? "");
  const suffix = last.startsWith(`ST-${prefix}-`) ? Number(last.slice(`ST-${prefix}-`.length)) || 0 : 0;
  return `ST-${prefix}-${String(suffix + 1).padStart(3, "0")}`;
}

export async function getSuggestedLocationTransferNo(transferDateInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const transferDate = normalizeDate(transferDateInput);
  if (!transferDate) return { error: "Transfer Date is required." };

  const transfer_no = await generateTransferNo(supabase, orgId, transferDate);
  return { ok: true, transfer_no };
}

export type SaveLocationTransferInput = {
  id?: string;
  request_date: string;
  transfer_date?: string;
  from_location_id: string;
  to_location_id: string;
  status?: string;
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

export async function saveLocationTransfer(input: SaveLocationTransferInput) {
  const { supabase, orgId, userId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(input.id ?? "").trim();
  const request_date = normalizeDate(input.request_date);
  const transfer_date_raw = normalizeDate(input.transfer_date);
  const transfer_date = transfer_date_raw || request_date;
  const from_location_id = String(input.from_location_id ?? "").trim();
  const to_location_id = String(input.to_location_id ?? "").trim();
  const status = String(input.status ?? "requested").trim().toLowerCase() || "requested";
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

  if (!request_date) return { error: "Request date is required." };
  if (!transfer_date) return { error: "Transfer date is required." };
  if (!from_location_id) return { error: "From location is required." };
  if (!to_location_id) return { error: "To location is required." };
  if (from_location_id === to_location_id) return { error: "From and To locations must be different." };
  if (lines.length === 0) return { error: "At least one valid line item is required." };

  const payload = {
    transfer_date,
    request_date,
    from_location_id,
    to_location_id,
    product_id: lines[0]?.product_id ?? null,
    qty: lines.reduce((s, l) => clamp2(s + l.ctn_qty), 0),
    status,
    notes,
  };

  if (id) {
    const { error: updateErr } = await supabase
      .from("location_transfers")
      .update(payload)
      .eq("id", id)
      .eq("organization_id", orgId);
    if (updateErr) return { error: updateErr.message };

    const { error: deleteLinesErr } = await supabase
      .from("location_transfer_lines")
      .delete()
      .eq("organization_id", orgId)
      .eq("location_transfer_id", id);
    if (deleteLinesErr) return { error: deleteLinesErr.message };

    const { error: insertLinesErr } = await supabase.from("location_transfer_lines").insert(
      lines.map((l) => ({
        organization_id: orgId,
        location_transfer_id: id,
        ...l,
      }))
    );
    if (insertLinesErr) return { error: insertLinesErr.message };
  } else {
    const transfer_no = await generateTransferNo(supabase, orgId, request_date);
    const { data: inserted, error: insertErr } = await supabase
      .from("location_transfers")
      .insert({
        organization_id: orgId,
        transfer_no,
        ...payload,
        created_by: userId,
      })
      .select("id")
      .single();
    if (insertErr) return { error: insertErr.message };

    const transferId = String((inserted as { id?: string } | null)?.id ?? "");
    if (!transferId) return { error: "Failed to create transfer request." };

    const { error: insertLinesErr } = await supabase.from("location_transfer_lines").insert(
      lines.map((l) => ({
        organization_id: orgId,
        location_transfer_id: transferId,
        ...l,
      }))
    );
    if (insertLinesErr) return { error: insertLinesErr.message };
  }

  revalidatePath("/dashboard/inventory/location-transfers");
  return { ok: true };
}

export async function deleteLocationTransfer(idInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(idInput ?? "").trim();
  if (!id) return { error: "Transfer ID is required." };

  const { error: deleteErr } = await supabase
    .from("location_transfers")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (deleteErr) return { error: deleteErr.message };
  revalidatePath("/dashboard/inventory/location-transfers");
  return { ok: true };
}
