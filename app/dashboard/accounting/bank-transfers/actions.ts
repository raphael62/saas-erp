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
  const like = `${prefix}-BT-%`;

  const { data } = await supabase
    .from("bank_transfers")
    .select("transfer_no")
    .eq("organization_id", orgId)
    .ilike("transfer_no", like)
    .order("transfer_no", { ascending: false })
    .limit(1);

  const last = String((data?.[0] as { transfer_no?: string } | undefined)?.transfer_no ?? "");
  const suffix = last.startsWith(prefix) ? Number(last.slice(prefix.length + 4)) || 0 : 0;
  return `${prefix}-BT-${String(suffix + 1).padStart(3, "0")}`;
}

export async function getSuggestedTransferNo(transferDateInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const transferDate = normalizeDate(transferDateInput);
  if (!transferDate) return { error: "Transfer Date is required." };

  const transfer_no = await generateTransferNo(supabase, orgId, transferDate);
  return { ok: true, transfer_no };
}

export type SaveBankTransferInput = {
  id?: string;
  transfer_date: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  reference?: string;
  notes?: string;
};

export async function saveBankTransfer(input: SaveBankTransferInput) {
  const { supabase, orgId, userId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(input.id ?? "").trim();
  const transfer_date = normalizeDate(input.transfer_date);
  const from_account_id = String(input.from_account_id ?? "").trim();
  const to_account_id = String(input.to_account_id ?? "").trim();
  const amount = clamp2(Number(input.amount ?? 0));
  const reference = String(input.reference ?? "").trim() || null;
  const notes = String(input.notes ?? "").trim() || null;

  if (!transfer_date) return { error: "Transfer date is required." };
  if (!from_account_id) return { error: "From account is required." };
  if (!to_account_id) return { error: "To account is required." };
  if (from_account_id === to_account_id) return { error: "From and To accounts must be different." };
  if (amount <= 0) return { error: "Amount must be greater than 0." };

  const payload = {
    transfer_date,
    from_account_id,
    to_account_id,
    amount,
    reference,
    notes,
  };

  if (id) {
    const { error: updateErr } = await supabase
      .from("bank_transfers")
      .update(payload)
      .eq("id", id)
      .eq("organization_id", orgId);
    if (updateErr) return { error: updateErr.message };
  } else {
    const transfer_no = await generateTransferNo(supabase, orgId, transfer_date);
    const { error: insertErr } = await supabase.from("bank_transfers").insert({
      organization_id: orgId,
      transfer_no,
      ...payload,
      created_by: userId,
    });
    if (insertErr) return { error: insertErr.message };
  }

  revalidatePath("/dashboard/accounting/bank-transfers");
  return { ok: true };
}

export async function deleteBankTransfer(idInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(idInput ?? "").trim();
  if (!id) return { error: "Transfer ID is required." };

  const { error: deleteErr } = await supabase
    .from("bank_transfers")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (deleteErr) return { error: deleteErr.message };
  revalidatePath("/dashboard/accounting/bank-transfers");
  return { ok: true };
}
