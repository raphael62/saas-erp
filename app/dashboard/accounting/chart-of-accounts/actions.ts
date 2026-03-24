"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ACCOUNT_TYPES = [
  "Asset",
  "Liability",
  "Equity",
  "Revenue",
  "Cost of Goods Sold",
  "Expense",
] as const;

async function getOrgContext() {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { supabase: ctx.supabase, orgId: null as string | null, error: ctx.error };
  return { supabase: ctx.supabase, orgId: ctx.orgId, error: null as string | null };
}

export async function saveChartOfAccount(formData: FormData) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = (formData.get("id") as string)?.trim() || null;
  const parent_id = (formData.get("parent_id") as string)?.trim() || null;
  const account_code = (formData.get("account_code") as string)?.trim();
  const account_name = (formData.get("account_name") as string)?.trim();
  const account_type = (formData.get("account_type") as string)?.trim();
  const sub_type = (formData.get("sub_type") as string)?.trim() || null;
  const dr_cr = (formData.get("dr_cr") as string)?.trim() || "Dr";
  const opening_balance_ghs = Number(formData.get("opening_balance_ghs")) || 0;
  const is_active = formData.get("is_active") === "true" || formData.get("is_active") === "on";

  if (!account_code || !account_name) return { error: "Account code and name are required" };
  if (!ACCOUNT_TYPES.includes(account_type as (typeof ACCOUNT_TYPES)[number])) {
    return { error: "Invalid account type" };
  }
  if (dr_cr !== "Dr" && dr_cr !== "Cr") return { error: "Dr/Cr must be Dr or Cr" };

  const payload: Record<string, unknown> = {
    parent_id: parent_id || null,
    account_code,
    account_name,
    account_type,
    sub_type,
    dr_cr,
    opening_balance_ghs,
    is_active,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error: updErr } = await supabase
      .from("chart_of_accounts")
      .update(payload)
      .eq("id", id)
      .eq("organization_id", orgId);
    if (updErr) return { error: updErr.message };
  } else {
    const { error: insErr } = await supabase
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        ...payload,
        current_balance_ghs: opening_balance_ghs,
      });
    if (insErr) return { error: insErr.message };
  }

  revalidatePath("/dashboard/accounting/chart-of-accounts");
  return { ok: true };
}

export async function deleteChartOfAccount(id: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const { error: delErr } = await supabase
    .from("chart_of_accounts")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (delErr) return { error: delErr.message };
  revalidatePath("/dashboard/accounting/chart-of-accounts");
  return { ok: true };
}
