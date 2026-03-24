"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const TABLES = [
  "brand_categories",
  "empties_types",
  "price_types",
  "units_of_measure",
  "payment_methods",
  "location_types",
  "customer_groups",
  "customer_types",
] as const;

type TableName = (typeof TABLES)[number];

export async function addMasterDataRow(
  table: TableName,
  formData: FormData
) {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { error: ctx.error };
  const { orgId, supabase } = ctx;

  const code = (formData.get("code") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;

  if (!code || !name) return { error: "Code and name are required" };

  const { error } = await supabase.from(table).insert({
    organization_id: orgId,
    code,
    name,
    description,
  });

  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings/master-data");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/products");
  return { ok: true };
}

export async function updateMasterDataRow(
  table: TableName,
  id: string,
  formData: FormData
) {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { error: ctx.error };
  const { orgId, supabase } = ctx;

  const code = (formData.get("code") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;

  if (!code || !name) return { error: "Code and name are required" };

  const { error } = await supabase
    .from(table)
    .update({ code, name, description })
    .eq("id", id)
    .eq("organization_id", orgId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings/master-data");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/products");
  return { ok: true };
}

export async function deleteMasterDataRow(table: TableName, id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings/master-data");
  return { ok: true };
}
