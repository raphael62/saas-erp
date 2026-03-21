"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ACCOUNT_TYPES = ["bank", "cash"] as const;

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

export async function savePaymentAccount(formData: FormData) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = (formData.get("id") as string)?.trim() || null;
  const chart_of_account_id = (formData.get("chart_of_account_id") as string)?.trim() || null;
  const code = (formData.get("code") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const account_type = (formData.get("account_type") as string)?.trim() || "bank";
  const is_active = formData.get("is_active") === "true" || formData.get("is_active") === "on";

  if (!code || !name) return { error: "Code and name are required" };
  if (!ACCOUNT_TYPES.includes(account_type as (typeof ACCOUNT_TYPES)[number])) {
    return { error: "Account type must be Bank or Cash" };
  }

  const payload = {
    chart_of_account_id: chart_of_account_id || null,
    code,
    name,
    account_type,
    is_active,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error: updErr } = await supabase
      .from("payment_accounts")
      .update(payload)
      .eq("id", id)
      .eq("organization_id", orgId);
    if (updErr) return { error: updErr.message };
  } else {
    const { error: insErr } = await supabase
      .from("payment_accounts")
      .insert({
        organization_id: orgId,
        ...payload,
      });
    if (insErr) return { error: insErr.message };
  }

  revalidatePath("/dashboard/accounting/payment-accounts");
  revalidatePath("/dashboard/sales/customer-payments");
  return { ok: true };
}

export async function deletePaymentAccount(id: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const { error: delErr } = await supabase
    .from("payment_accounts")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (delErr) return { error: delErr.message };
  revalidatePath("/dashboard/accounting/payment-accounts");
  revalidatePath("/dashboard/sales/customer-payments");
  return { ok: true };
}
