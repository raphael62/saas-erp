"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function parseOptional(value: FormDataEntryValue | null) {
  const v = String(value ?? "").trim();
  return v || null;
}

function parseMoney(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function parsePaymentTerms(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return 30;
  if (raw.startsWith("net")) {
    const days = Number(raw.replace("net", ""));
    return Number.isFinite(days) ? days : 30;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 30;
}

export async function saveSupplier(formData: FormData) {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { error: ctx.error };
  const { orgId, supabase } = ctx;

  const id = String(formData.get("id") ?? "").trim() || null;
  const code = parseOptional(formData.get("code"));
  const name = String(formData.get("name") ?? "").trim();
  const category = parseOptional(formData.get("category"));
  const taxId = parseOptional(formData.get("tax_id"));
  const contactPerson = parseOptional(formData.get("contact_person"));
  const phone = parseOptional(formData.get("phone"));
  const mobile = parseOptional(formData.get("mobile"));
  const email = parseOptional(formData.get("email"));
  const address = parseOptional(formData.get("address"));
  const city = parseOptional(formData.get("city"));
  const paymentTerms = parsePaymentTerms(formData.get("payment_terms"));
  const bankName = parseOptional(formData.get("bank_name"));
  const bankAccount = parseOptional(formData.get("bank_account"));
  const bankBranch = parseOptional(formData.get("bank_branch"));
  const creditLimit = parseMoney(formData.get("credit_limit"));
  const currency = String(formData.get("currency") ?? "GHS").trim() || "GHS";
  const supplierStatus = String(formData.get("supplier_status") ?? "Active").trim() || "Active";
  const notes = parseOptional(formData.get("notes"));
  const isActiveRaw = formData.get("is_active");
  const isActive =
    isActiveRaw == null
      ? supplierStatus.toLowerCase() !== "inactive"
      : String(isActiveRaw).toLowerCase() !== "false";

  if (!name) return { error: "Vendor name is required." };
  if (!code) return { error: "Vendor code is required." };

  const payload = {
    organization_id: orgId,
    code,
    name,
    category,
    tax_id: taxId,
    contact_person: contactPerson,
    phone,
    mobile,
    email,
    address,
    city,
    payment_terms: paymentTerms,
    bank_name: bankName,
    bank_account: bankAccount,
    bank_branch: bankBranch,
    credit_limit: creditLimit,
    currency,
    supplier_status: supplierStatus,
    notes,
    is_active: isActive,
  };

  const result = id
    ? await supabase
        .from("suppliers")
        .update(payload)
        .eq("organization_id", orgId)
        .eq("id", id)
    : await supabase.from("suppliers").insert(payload);

  if (result.error) return { error: result.error.message };
  revalidatePath("/dashboard/purchases/suppliers");
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/purchases/purchase-invoices");
  return { ok: true };
}

export async function deleteSupplier(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/purchases/suppliers");
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/purchases/purchase-invoices");
  return { ok: true };
}

export async function toggleSupplierActive(id: string, nextActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: nextActive })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/purchases/suppliers");
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/purchases/purchase-invoices");
  return { ok: true };
}
