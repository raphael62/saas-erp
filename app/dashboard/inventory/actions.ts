"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { parseBool, parseCsv, parseNumber } from "@/lib/csv";

type TemplateColumnInput = {
  column_key: string;
  visible: boolean;
  width: number | null;
  sort_order: number | null;
  sort_direction: "asc" | "desc" | null;
  display_order: number;
};

type TemplatePayload = {
  module_key: string;
  name: string;
  authorization_user_id?: string | null;
  authorization_group?: string | null;
  is_default?: boolean;
};

async function getCurrentOrgId() {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const result = await getOrgContextForAction();
  if (!result.ok) return { error: result.error as "Unauthorized" | "No organization" };
  return { orgId: result.orgId, userId: result.userId, supabase: result.supabase };
}

function buildProductPayload(formData: FormData, orgId: string) {
  const name = formData.get("name") as string;
  const code = (formData.get("code") as string)?.trim() || null;
  const sku = (formData.get("sku") as string)?.trim() || code;
  const description = (formData.get("description") as string) || null;
  const category = (formData.get("category") as string) || null;
  const unit = (formData.get("unit") as string) || "pcs";
  const stockQuantity = Number(formData.get("stock_quantity")) || 0;
  const minStock = Number(formData.get("min_stock")) || 0;
  const packUnitRaw = formData.get("pack_unit");
  const packUnit = packUnitRaw !== null && packUnitRaw !== "" ? Number(packUnitRaw) : null;
  const plasticCost = formData.get("plastic_cost") ? Number(formData.get("plastic_cost")) : null;
  const bottleCost = formData.get("bottle_cost") ? Number(formData.get("bottle_cost")) : null;
  const reorderQty = formData.get("reorder_qty") ? Number(formData.get("reorder_qty")) : null;
  const barcode = (formData.get("barcode") as string)?.trim() || null;
  const supplierId = (formData.get("supplier_id") as string)?.trim() || null;
  const emptiesType = (formData.get("empties_type") as string)?.trim() || null;
  const isActive = formData.get("is_active") !== "false";
  const taxable = formData.get("taxable") === "1";
  const returnable = formData.get("returnable") === "1";

  if (!name?.trim()) return { error: "Name is required" as const };
  if (packUnit === null || packUnit === undefined || isNaN(packUnit) || packUnit < 0) {
    return { error: "Pack Unit is required" as const };
  }

  const payload: Record<string, unknown> = {
    organization_id: orgId,
    name: name.trim(),
    sku: sku || code,
    description: description || null,
    category: category || null,
    unit,
    stock_quantity: stockQuantity,
    min_stock: minStock,
    pack_unit: packUnit,
    is_active: isActive,
    taxable,
    returnable,
  };
  if (code) payload.code = code;
  if (plasticCost != null) payload.plastic_cost = plasticCost;
  if (bottleCost != null) payload.bottle_cost = bottleCost;
  if (reorderQty != null) payload.reorder_qty = reorderQty;
  if (barcode) payload.barcode = barcode;
  if (supplierId) payload.supplier_id = supplierId;
  if (emptiesType) payload.empties_type = emptiesType;

  return { payload };
}

export async function addProduct(formData: FormData) {
  const ctx = await getCurrentOrgId();
  if ("error" in ctx) return { error: ctx.error };
  const { orgId, supabase } = ctx;

  const built = buildProductPayload(formData, orgId);
  if ("error" in built) return { error: built.error };
  const { payload } = built;

  const { error } = await supabase.from("products").insert(payload);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/products");
  return { ok: true };
}

export async function updateProduct(id: string, formData: FormData) {
  const ctx = await getCurrentOrgId();
  if ("error" in ctx) return { error: ctx.error };
  const { orgId, supabase } = ctx;

  const built = buildProductPayload(formData, orgId);
  if ("error" in built) return { error: built.error };
  const { payload } = built;

  const { error } = await supabase
    .from("products")
    .update(payload)
    .eq("id", id)
    .eq("organization_id", orgId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/products");
  return { ok: true };
}

export async function deleteProduct(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/inventory");
  return { ok: true };
}

export async function importProductsCsv(formData: FormData) {
  const ctx = await getCurrentOrgId();
  if ("error" in ctx) return { error: ctx.error };
  const { orgId, supabase } = ctx;

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "CSV file is required" };
  const rows = parseCsv(await file.text());
  if (rows.length === 0) return { error: "CSV has no data rows" };

  const productsRes = await supabase
    .from("products")
    .select("id, code, name")
    .eq("organization_id", orgId);
  const existing = productsRes.error ? [] : (productsRes.data ?? []);
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const p of existing as Array<{ id: string; code?: string | null; name?: string | null }>) {
    if (p.code) byCode.set(p.code.toLowerCase(), p.id);
    if (p.name) byName.set(p.name.toLowerCase(), p.id);
  }

  const suppliersRes = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("organization_id", orgId);
  const suppliers = suppliersRes.error ? [] : (suppliersRes.data ?? []);
  const supplierByName = new Map<string, string>();
  for (const s of suppliers as Array<{ id: string; name?: string | null }>) {
    if (s.name) supplierByName.set(s.name.toLowerCase(), s.id);
  }

  let imported = 0;
  for (const row of rows) {
    const code = (row.product_code || row.code || "").trim();
    const name = (row.product_name || row.name || "").trim();
    if (!name) continue;

    const supplierName = (row.supplier || "").trim().toLowerCase();
    const payload = {
      organization_id: orgId,
      code: code || null,
      name,
      sku: code || name,
      category: (row.brand_category || row.category || "").trim() || null,
      unit: (row.unit_of_measure || row.unit || "").trim() || "pcs",
      pack_unit: parseNumber(row.pack_unit, 0),
      empties_type: (row.empties_type || "").trim() || null,
      min_stock: parseNumber(row.reorder_level, 0),
      reorder_qty: parseNumber(row.reorder_quantity, 0),
      barcode: (row.barcode || "").trim() || null,
      supplier_id: supplierByName.get(supplierName) ?? null,
      description: (row.description || "").trim() || null,
      taxable: parseBool(row.taxable, true),
      returnable: parseBool(row.returnable, false),
      is_active: parseBool(row.status, true),
      stock_quantity: 0,
    };

    const existingId = (code && byCode.get(code.toLowerCase())) || byName.get(name.toLowerCase());
    if (existingId) {
      const { error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", existingId)
        .eq("organization_id", orgId);
      if (error) return { error: error.message };
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert(payload)
        .select("id")
        .single();
      if (error) return { error: error.message };
      if (code) byCode.set(code.toLowerCase(), data.id);
      byName.set(name.toLowerCase(), data.id);
    }
    imported += 1;
  }

  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/products");
  return { ok: true, count: imported };
}

export async function getListTemplates(moduleKey: string) {
  const ctx = await getCurrentOrgId();
  if ("error" in ctx) return { error: ctx.error };
  const { orgId, supabase } = ctx;

  const { data, error } = await supabase
    .from("list_templates")
    .select("id, module_key, name, authorization_user_id, authorization_group, is_default, created_at, updated_at")
    .eq("organization_id", orgId)
    .eq("module_key", moduleKey)
    .order("is_default", { ascending: false })
    .order("name");

  if (error) return { error: error.message };
  return { data: data ?? [] };
}

export async function getTemplateDefinition(templateId: string) {
  const ctx = await getCurrentOrgId();
  if ("error" in ctx) return { error: ctx.error };
  const { orgId, supabase } = ctx;

  const { data: template, error: templateError } = await supabase
    .from("list_templates")
    .select("id, module_key, name, authorization_user_id, authorization_group, is_default, created_at, updated_at")
    .eq("id", templateId)
    .eq("organization_id", orgId)
    .single();
  if (templateError) return { error: templateError.message };

  const { data: columns, error: columnsError } = await supabase
    .from("list_template_columns")
    .select("id, template_id, column_key, visible, width, sort_order, sort_direction, display_order")
    .eq("template_id", templateId)
    .order("display_order", { ascending: true });
  if (columnsError) return { error: columnsError.message };

  return { data: { template, columns: columns ?? [] } };
}

export async function createListTemplate(payload: TemplatePayload) {
  const ctx = await getCurrentOrgId();
  if ("error" in ctx) return { error: ctx.error };
  const { orgId, userId, supabase } = ctx;

  const cleanName = payload.name?.trim();
  if (!cleanName) return { error: "Template name is required" };

  const insertPayload = {
    organization_id: orgId,
    module_key: payload.module_key,
    name: cleanName,
    authorization_user_id: payload.authorization_user_id ?? null,
    authorization_group: payload.authorization_group ?? null,
    is_default: Boolean(payload.is_default),
    created_by: userId,
  };

  if (insertPayload.is_default) {
    await supabase
      .from("list_templates")
      .update({ is_default: false })
      .eq("organization_id", orgId)
      .eq("module_key", payload.module_key);
  }

  const { data, error } = await supabase
    .from("list_templates")
    .insert(insertPayload)
    .select("id, module_key, name, authorization_user_id, authorization_group, is_default, created_at, updated_at")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/dashboard/inventory/products");
  return { data };
}

export async function updateListTemplate(templateId: string, payload: Partial<TemplatePayload>) {
  const ctx = await getCurrentOrgId();
  if ("error" in ctx) return { error: ctx.error };
  const { orgId, supabase } = ctx;

  const updatePayload: Record<string, unknown> = {};
  if (payload.name !== undefined) {
    const cleanName = payload.name.trim();
    if (!cleanName) return { error: "Template name is required" };
    updatePayload.name = cleanName;
  }
  if (payload.authorization_user_id !== undefined) updatePayload.authorization_user_id = payload.authorization_user_id || null;
  if (payload.authorization_group !== undefined) updatePayload.authorization_group = payload.authorization_group || null;
  if (payload.is_default !== undefined) updatePayload.is_default = payload.is_default;

  if (payload.is_default) {
    const { data: current } = await supabase
      .from("list_templates")
      .select("module_key")
      .eq("id", templateId)
      .eq("organization_id", orgId)
      .single();
    if (current?.module_key) {
      await supabase
        .from("list_templates")
        .update({ is_default: false })
        .eq("organization_id", orgId)
        .eq("module_key", current.module_key);
    }
  }

  const { data, error } = await supabase
    .from("list_templates")
    .update(updatePayload)
    .eq("id", templateId)
    .eq("organization_id", orgId)
    .select("id, module_key, name, authorization_user_id, authorization_group, is_default, created_at, updated_at")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/dashboard/inventory/products");
  return { data };
}

export async function saveTemplateColumns(templateId: string, columns: TemplateColumnInput[]) {
  const ctx = await getCurrentOrgId();
  if ("error" in ctx) return { error: ctx.error };
  const { orgId, supabase } = ctx;

  const { data: ownedTemplate, error: ownershipError } = await supabase
    .from("list_templates")
    .select("id")
    .eq("id", templateId)
    .eq("organization_id", orgId)
    .single();
  if (ownershipError || !ownedTemplate) return { error: "Template not found" };

  const { error: deleteError } = await supabase
    .from("list_template_columns")
    .delete()
    .eq("template_id", templateId);
  if (deleteError) return { error: deleteError.message };

  if (columns.length > 0) {
    const insertRows = columns.map((col) => ({
      template_id: templateId,
      column_key: col.column_key,
      visible: col.visible,
      width: col.width,
      sort_order: col.sort_order,
      sort_direction: col.sort_direction,
      display_order: col.display_order,
    }));
    const { error: insertError } = await supabase
      .from("list_template_columns")
      .insert(insertRows);
    if (insertError) return { error: insertError.message };
  }

  revalidatePath("/dashboard/inventory/products");
  return { ok: true };
}

export async function ensureDefaultListTemplate(moduleKey: string) {
  const ctx = await getCurrentOrgId();
  if ("error" in ctx) return { error: ctx.error };
  const { orgId, userId, supabase } = ctx;

  const { data: existing, error: existingError } = await supabase
    .from("list_templates")
    .select("id")
    .eq("organization_id", orgId)
    .eq("module_key", moduleKey)
    .eq("is_default", true)
    .maybeSingle();
  if (existingError) return { error: existingError.message };
  if (existing?.id) return { data: existing };

  const { data: created, error: createError } = await supabase
    .from("list_templates")
    .insert({
      organization_id: orgId,
      module_key: moduleKey,
      name: "Default",
      is_default: true,
      created_by: userId,
    })
    .select("id")
    .single();
  if (createError) return { error: createError.message };

  return { data: created };
}
