"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { parseBool, parseCsv } from "@/lib/csv";

export async function addSalesRep(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id?: string } | null)?.organization_id;
  if (!orgId) return { error: "No organization" };

  const code = (formData.get("code") as string) || null;
  const firstName = ((formData.get("first_name") as string) || "").trim();
  const lastName = ((formData.get("last_name") as string) || "").trim();
  const name = `${firstName} ${lastName}`.trim();
  const phone = (formData.get("phone") as string) || null;
  const email = (formData.get("email") as string) || null;
  const salesRepType = (formData.get("sales_rep_type") as string) || null;
  const location = (formData.get("location") as string) || null;
  const isActive = formData.get("is_active") !== "false";

  if (!name?.trim()) return { error: "Name is required" };

  const { error } = await supabase.from("sales_reps").insert({
    organization_id: orgId,
    name: name.trim(),
    code: code?.trim() || null,
    phone: phone?.trim() || null,
    email: email?.trim() || null,
    first_name: firstName || null,
    last_name: lastName || null,
    sales_rep_type: salesRepType?.trim() || null,
    location: location?.trim() || null,
    is_active: isActive,
  });

  if (error) return { error: error.message };
  revalidatePath("/dashboard/sales/sales-reps");
  revalidatePath("/dashboard/sales/customers");
  return { ok: true };
}

export async function updateSalesRep(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const firstName = ((formData.get("first_name") as string) || "").trim();
  const lastName = ((formData.get("last_name") as string) || "").trim();
  const name = `${firstName} ${lastName}`.trim();
  const code = (formData.get("code") as string) || null;
  const phone = (formData.get("phone") as string) || null;
  const email = (formData.get("email") as string) || null;
  const salesRepType = (formData.get("sales_rep_type") as string) || null;
  const location = (formData.get("location") as string) || null;
  const isActive = formData.get("is_active") !== "false";

  if (!name) return { error: "Name is required" };

  const { error } = await supabase
    .from("sales_reps")
    .update({
      name,
      code: code?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      first_name: firstName || null,
      last_name: lastName || null,
      sales_rep_type: salesRepType?.trim() || null,
      location: location?.trim() || null,
      is_active: isActive,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/sales/sales-reps");
  revalidatePath("/dashboard/sales/customers");
  return { ok: true };
}

export async function importSalesRepsCsv(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  const orgId = (profile as { organization_id?: string } | null)?.organization_id;
  if (!orgId) return { error: "No organization" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "CSV file is required" };
  const rows = parseCsv(await file.text());
  if (rows.length === 0) return { error: "CSV has no data rows" };

  const existingRes = await supabase
    .from("sales_reps")
    .select("id, code, name")
    .eq("organization_id", orgId);
  const existing = existingRes.error ? [] : (existingRes.data ?? []);
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const rep of existing as Array<{ id: string; code?: string | null; name?: string | null }>) {
    if (rep.code) byCode.set(rep.code.toLowerCase(), rep.id);
    if (rep.name) byName.set(rep.name.toLowerCase(), rep.id);
  }

  let imported = 0;
  for (const row of rows) {
    const code = (row.executive_code || row.code || "").trim();
    const firstName = (row.first_name || "").trim();
    const lastName = (row.last_name || "").trim();
    const fullName = `${firstName} ${lastName}`.trim() || (row.name || "").trim();
    if (!fullName) continue;

    const payload = {
      organization_id: orgId,
      code: code || null,
      first_name: firstName || null,
      last_name: lastName || null,
      name: fullName,
      sales_rep_type: (row.sales_rep_type || "").trim() || null,
      phone: (row.phone || "").trim() || null,
      email: (row.email || "").trim() || null,
      location: (row.location || "").trim() || null,
      is_active: parseBool(row.status, true),
    };

    const existingId = (code && byCode.get(code.toLowerCase())) || byName.get(fullName.toLowerCase());
    if (existingId) {
      const { error } = await supabase
        .from("sales_reps")
        .update(payload)
        .eq("id", existingId)
        .eq("organization_id", orgId);
      if (error) return { error: error.message };
    } else {
      const { data, error } = await supabase
        .from("sales_reps")
        .insert(payload)
        .select("id")
        .single();
      if (error) return { error: error.message };
      if (code) byCode.set(code.toLowerCase(), data.id);
      byName.set(fullName.toLowerCase(), data.id);
    }
    imported += 1;
  }

  revalidatePath("/dashboard/sales/sales-reps");
  revalidatePath("/dashboard/sales/customers");
  revalidatePath("/dashboard/sales");
  return { ok: true, count: imported };
}
