"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { parseBool, parseCsv, parseNumber } from "@/lib/csv";

export async function addCustomer(formData: FormData) {
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

  const name = formData.get("name") as string;
  const contactPerson = (formData.get("contact_person") as string) || null;
  const email = (formData.get("email") as string) || null;
  const phone = (formData.get("phone") as string) || null;
  const address = (formData.get("address") as string) || null;
  const taxId = (formData.get("tax_id") as string) || null;
  const creditLimit = Number(formData.get("credit_limit")) || 0;
  const paymentTerms = Number(formData.get("payment_terms")) || 30;
  const customerType = (formData.get("customer_type") as string) || "Retail";
  const priceType = (formData.get("price_type") as string) || "Retail Price";
  const salesRepId = (formData.get("sales_rep_id") as string) || null;
  const isActive = (formData.get("is_active") as string) !== "false";

  if (!name?.trim()) return { error: "Name is required" };

  const { error } = await supabase.from("customers").insert({
    organization_id: orgId,
    name: name.trim(),
    contact_person: contactPerson?.trim() || null,
    email: email?.trim() || null,
    phone: phone?.trim() || null,
    address: address?.trim() || null,
    tax_id: taxId?.trim() || null,
    credit_limit: creditLimit,
    payment_terms: paymentTerms,
    customer_type: customerType,
    price_type: priceType,
    sales_rep_id: salesRepId || null,
    is_active: isActive,
  });

  if (error) return { error: error.message };
  revalidatePath("/dashboard/sales/customers");
  revalidatePath("/dashboard/sales");
  return { ok: true };
}

export async function updateCustomer(id: string, formData: FormData) {
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

  const name = formData.get("name") as string;
  const contactPerson = (formData.get("contact_person") as string) || null;
  const email = (formData.get("email") as string) || null;
  const phone = (formData.get("phone") as string) || null;
  const address = (formData.get("address") as string) || null;
  const taxId = (formData.get("tax_id") as string) || null;
  const creditLimit = Number(formData.get("credit_limit")) || 0;
  const paymentTerms = Number(formData.get("payment_terms")) || 30;
  const customerType = (formData.get("customer_type") as string) || "Retail";
  const priceType = (formData.get("price_type") as string) || "Retail Price";
  const salesRepId = (formData.get("sales_rep_id") as string) || null;
  const isActive = (formData.get("is_active") as string) !== "false";

  if (!name?.trim()) return { error: "Name is required" };

  const { error } = await supabase
    .from("customers")
    .update({
      name: name.trim(),
      contact_person: contactPerson?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      tax_id: taxId?.trim() || null,
      credit_limit: creditLimit,
      payment_terms: paymentTerms,
      customer_type: customerType,
      price_type: priceType,
      sales_rep_id: salesRepId || null,
      is_active: isActive,
    })
    .eq("id", id)
    .eq("organization_id", orgId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/sales/customers");
  revalidatePath("/dashboard/sales");
  return { ok: true };
}

export async function deleteCustomer(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/sales/customers");
  revalidatePath("/dashboard/sales");
  return { ok: true };
}

export async function importCustomersCsv(formData: FormData) {
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
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) return { error: "CSV has no data rows" };

  const repsRes = await supabase
    .from("sales_reps")
    .select("id, name, code")
    .eq("organization_id", orgId);
  const repRows = repsRes.error ? [] : (repsRes.data ?? []);
  const repByLookup = new Map<string, string>();
  for (const rep of repRows as Array<{ id: string; name?: string | null; code?: string | null }>) {
    if (rep.name) repByLookup.set(rep.name.toLowerCase(), rep.id);
    if (rep.code) repByLookup.set(rep.code.toLowerCase(), rep.id);
  }

  const customersRes = await supabase
    .from("customers")
    .select("id, name, tax_id")
    .eq("organization_id", orgId);
  const existing = customersRes.error ? [] : (customersRes.data ?? []);
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of existing as Array<{ id: string; name?: string | null; tax_id?: string | null }>) {
    if (c.tax_id) byCode.set(c.tax_id.toLowerCase(), c.id);
    if (c.name) byName.set(c.name.toLowerCase(), c.id);
  }

  let imported = 0;
  for (const row of rows) {
    const name = (row.customer_name || row.name || "").trim();
    if (!name) continue;
    const customerCode = (row.customer_code || row.tax_id || "").trim();
    const repLookup = (row.business_executive || "").trim().toLowerCase();
    const salesRepId = repLookup ? (repByLookup.get(repLookup) ?? null) : null;

    const payload = {
      organization_id: orgId,
      name,
      contact_person: (row.business_name || row.contact_person || "").trim() || null,
      email: (row.email || "").trim() || null,
      phone: (row.mobile || row.phone || "").trim() || null,
      address: (row.business_address || row.address || "").trim() || null,
      tax_id: customerCode || null,
      customer_type: (row.customer_type || "Retail").trim(),
      price_type: (row.price_type || "Retail Price").trim(),
      sales_rep_id: salesRepId,
      credit_limit: parseNumber(row.credit_limit, 0),
      payment_terms: parseNumber(row.call_days, 30),
      is_active: parseBool(row.status, true),
    };

    const keyCode = customerCode.toLowerCase();
    const existingId = (customerCode && byCode.get(keyCode)) || byName.get(name.toLowerCase());
    if (existingId) {
      const { error } = await supabase
        .from("customers")
        .update(payload)
        .eq("id", existingId)
        .eq("organization_id", orgId);
      if (error) return { error: error.message };
    } else {
      const { data, error } = await supabase
        .from("customers")
        .insert(payload)
        .select("id")
        .single();
      if (error) return { error: error.message };
      if (customerCode) byCode.set(keyCode, data.id);
      byName.set(name.toLowerCase(), data.id);
    }
    imported += 1;
  }

  revalidatePath("/dashboard/sales/customers");
  revalidatePath("/dashboard/sales");
  return { ok: true, count: imported };
}
