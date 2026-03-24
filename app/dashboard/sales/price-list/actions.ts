"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseBool, parseCsv, parseNumber } from "@/lib/csv";

async function getOrgId() {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { error: ctx.error, supabase: ctx.supabase, orgId: null as string | null };
  return { error: null as string | null, supabase: ctx.supabase, orgId: ctx.orgId };
}

export async function savePriceList(formData: FormData) {
  const { error: orgError, supabase, orgId } = await getOrgId();
  if (orgError || !orgId) return { error: orgError ?? "Unauthorized" };

  const id = (formData.get("id") as string | null)?.trim() || null;
  const name = (formData.get("name") as string | null)?.trim();
  const priceTypeId = (formData.get("price_type_id") as string | null)?.trim();
  const effectiveDate = (formData.get("effective_date") as string | null)?.trim() || null;
  const expiryDate = (formData.get("expiry_date") as string | null)?.trim() || null;
  const notes = (formData.get("notes") as string | null)?.trim() || null;
  const isActive = (formData.get("is_active") as string | null) !== "false";

  if (!name) return { error: "Price List Name is required" };
  if (!priceTypeId) return { error: "Price Type is required" };

  const rowProductId = new Map<string, string>();
  const rowPrice = new Map<string, number>();
  const rowTax = new Map<string, number>();
  const rowVat = new Map<string, string>();
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("line_product_id_")) {
      const rowKey = key.replace("line_product_id_", "");
      const productId = String(value ?? "").trim();
      if (rowKey && productId) rowProductId.set(rowKey, productId);
      continue;
    }
    if (key.startsWith("line_price_")) {
      const rowKey = key.replace("line_price_", "");
      const raw = String(value ?? "").replace(/,/g, "").trim();
      if (raw === "") continue;
      const numeric = Number(raw);
      if (!Number.isFinite(numeric) || numeric < 0) return { error: "Line prices must be valid numbers >= 0" };
      rowPrice.set(rowKey, Number(numeric.toFixed(2)));
      continue;
    }
    if (key.startsWith("line_tax_")) {
      const rowKey = key.replace("line_tax_", "");
      const raw = String(value ?? "").trim();
      const numeric = Number(raw);
      if (Number.isFinite(numeric) && numeric >= 0) rowTax.set(rowKey, Number(numeric.toFixed(2)));
      continue;
    }
    if (key.startsWith("line_vat_")) {
      const rowKey = key.replace("line_vat_", "");
      const raw = String(value ?? "").trim().toLowerCase();
      rowVat.set(rowKey, raw === "exc" ? "exc" : "inc");
    }
  }

  if (rowPrice.size === 0) return { error: "Enter at least one line with a price" };

  let priceListId = id;
  if (priceListId) {
    const { error } = await supabase
      .from("price_lists")
      .update({
        name,
        price_type_id: priceTypeId,
        effective_date: effectiveDate,
        expiry_date: expiryDate,
        notes,
        is_active: isActive,
      })
      .eq("id", priceListId)
      .eq("organization_id", orgId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("price_lists")
      .insert({
        organization_id: orgId,
        name,
        price_type_id: priceTypeId,
        effective_date: effectiveDate,
        expiry_date: expiryDate,
        notes,
        is_active: isActive,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    priceListId = data?.id ?? null;
    if (!priceListId) return { error: "Failed to create price list" };
  }

  const lineRows: Array<{
    organization_id: string;
    price_list_id: string;
    product_id: string;
    price: number;
    tax_rate: number;
    vat_type: string;
  }> = [];

  for (const [rowKey, price] of rowPrice.entries()) {
    const productId = rowProductId.get(rowKey) ?? rowKey;
    if (!productId) continue;
    lineRows.push({
      organization_id: orgId,
      price_list_id: priceListId,
      product_id: productId,
      price,
      tax_rate: rowTax.get(rowKey) ?? 0,
      vat_type: rowVat.get(rowKey) ?? "inc",
    });
  }

  if (lineRows.length === 0) return { error: "Select product code/name for the priced rows" };

  const { error: clearError } = await supabase
    .from("price_list_items")
    .delete()
    .eq("organization_id", orgId)
    .eq("price_list_id", priceListId);
  if (clearError) return { error: clearError.message };

  const { error: insertError } = await supabase.from("price_list_items").insert(lineRows);
  if (insertError) return { error: insertError.message };

  revalidatePath("/dashboard/sales/price-list");
  revalidatePath("/dashboard/sales");
  return { ok: true };
}

export async function deletePriceList(id: string) {
  const { error: orgError, supabase, orgId } = await getOrgId();
  if (orgError || !orgId) return { error: orgError ?? "Unauthorized" };

  const priceListId = id.trim();
  if (!priceListId) return { error: "Missing price list id" };

  const { error: itemError } = await supabase
    .from("price_list_items")
    .delete()
    .eq("organization_id", orgId)
    .eq("price_list_id", priceListId);
  if (itemError) return { error: itemError.message };

  const { error } = await supabase
    .from("price_lists")
    .delete()
    .eq("organization_id", orgId)
    .eq("id", priceListId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/sales/price-list");
  revalidatePath("/dashboard/sales");
  return { ok: true };
}

export async function upsertProductPrices(formData: FormData) {
  const { error: orgError, supabase, orgId } = await getOrgId();
  if (orgError || !orgId) return { error: orgError ?? "Unauthorized" };

  const productId = (formData.get("product_id") as string | null)?.trim();
  if (!productId) return { error: "Missing product" };

  const entries: Array<{ organization_id: string; product_id: string; price_type_id: string; price: number; is_active: boolean }> = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("price_")) continue;
    const linePriceTypeId = key.replace("price_", "");
    const raw = String(value ?? "").replace(/,/g, "").trim();
    if (!linePriceTypeId || raw === "") continue;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return { error: "Price values must be valid numbers >= 0" };
    }
    entries.push({
      organization_id: orgId,
      product_id: productId,
      price_type_id: linePriceTypeId,
      price: Number(numeric.toFixed(2)),
      is_active: true,
    });
  }

  if (entries.length === 0) return { error: "Enter at least one price value" };

  const { error } = await supabase
    .from("product_prices")
    .upsert(entries, { onConflict: "organization_id,product_id,price_type_id" });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/sales/price-list");
  revalidatePath("/dashboard/sales");
  return { ok: true };
}

export async function importPriceListsCsv(formData: FormData) {
  const { error: orgError, supabase, orgId } = await getOrgId();
  if (orgError || !orgId) return { error: orgError ?? "Unauthorized" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "CSV file is required" };
  const rows = parseCsv(await file.text());
  if (rows.length === 0) return { error: "CSV has no data rows" };

  const productsRes = await supabase
    .from("products")
    .select("id, code, name")
    .eq("organization_id", orgId);
  const products = productsRes.error ? [] : (productsRes.data ?? []);
  const productByCode = new Map<string, string>();
  const productByName = new Map<string, string>();
  for (const p of products as Array<{ id: string; code?: string | null; name?: string | null }>) {
    if (p.code) productByCode.set(p.code.toLowerCase(), p.id);
    if (p.name) productByName.set(p.name.toLowerCase(), p.id);
  }

  const typesRes = await supabase
    .from("price_types")
    .select("id, code, name")
    .eq("organization_id", orgId);
  const types = typesRes.error ? [] : (typesRes.data ?? []);
  const typeByLookup = new Map<string, string>();
  for (const t of types as Array<{ id: string; code?: string | null; name?: string | null }>) {
    if (t.name) typeByLookup.set(t.name.toLowerCase(), t.id);
    if (t.code) typeByLookup.set(t.code.toLowerCase(), t.id);
  }

  type Group = {
    name: string;
    priceTypeId: string;
    effectiveDate: string;
    expiryDate: string | null;
    notes: string | null;
    isActive: boolean;
    lines: Array<{ product_id: string; price: number; tax_rate: number; vat_type: string }>;
  };
  const groups = new Map<string, Group>();

  for (const row of rows) {
    const name = (row.price_list_name || row.name || "").trim();
    const priceTypeLookup = (row.price_type || "").trim().toLowerCase();
    const effectiveDate = (row.effective_date || "").trim();
    if (!name || !priceTypeLookup || !effectiveDate) continue;

    const priceTypeId = typeByLookup.get(priceTypeLookup);
    if (!priceTypeId) return { error: `Price Type not found: ${row.price_type}` };

    const productCode = (row.product_code || "").trim().toLowerCase();
    const productName = (row.product_name || "").trim().toLowerCase();
    const productId = (productCode && productByCode.get(productCode)) || (productName && productByName.get(productName));
    if (!productId) return { error: `Product not found for row: ${row.product_code || row.product_name}` };

    const key = `${name.toLowerCase()}|${priceTypeId}|${effectiveDate}`;
    if (!groups.has(key)) {
      groups.set(key, {
        name,
        priceTypeId,
        effectiveDate,
        expiryDate: (row.expiry_date || "").trim() || null,
        notes: (row.notes || "").trim() || null,
        isActive: parseBool(row.status, true),
        lines: [],
      });
    }
    groups.get(key)!.lines.push({
      product_id: productId,
      price: parseNumber(row.price_tax_inc, 0),
      tax_rate: parseNumber(row.tax_rate, 0),
      vat_type: String(row.vat_type || "inc").trim().toLowerCase() === "exc" ? "exc" : "inc",
    });
  }

  if (groups.size === 0) return { error: "No valid rows found in CSV" };

  let imported = 0;
  for (const group of groups.values()) {
    const existingRes = await supabase
      .from("price_lists")
      .select("id")
      .eq("organization_id", orgId)
      .eq("name", group.name)
      .eq("price_type_id", group.priceTypeId)
      .eq("effective_date", group.effectiveDate)
      .maybeSingle();

    let priceListId = existingRes.data?.id as string | undefined;
    if (priceListId) {
      const { error } = await supabase
        .from("price_lists")
        .update({
          expiry_date: group.expiryDate,
          notes: group.notes,
          is_active: group.isActive,
        })
        .eq("organization_id", orgId)
        .eq("id", priceListId);
      if (error) return { error: error.message };
    } else {
      const { data, error } = await supabase
        .from("price_lists")
        .insert({
          organization_id: orgId,
          name: group.name,
          price_type_id: group.priceTypeId,
          effective_date: group.effectiveDate,
          expiry_date: group.expiryDate,
          notes: group.notes,
          is_active: group.isActive,
        })
        .select("id")
        .single();
      if (error) return { error: error.message };
      priceListId = data.id as string;
    }

    const { error: clearError } = await supabase
      .from("price_list_items")
      .delete()
      .eq("organization_id", orgId)
      .eq("price_list_id", priceListId);
    if (clearError) return { error: clearError.message };

    const lines = group.lines.map((line) => ({
      organization_id: orgId,
      price_list_id: priceListId!,
      product_id: line.product_id,
      price: line.price,
      tax_rate: line.tax_rate,
      vat_type: line.vat_type,
    }));
    const { error: insertError } = await supabase.from("price_list_items").insert(lines);
    if (insertError) return { error: insertError.message };
    imported += 1;
  }

  revalidatePath("/dashboard/sales/price-list");
  revalidatePath("/dashboard/sales");
  return { ok: true, count: imported };
}

export async function importPriceListItemsCsvToSelected(formData: FormData) {
  const { error: orgError, supabase, orgId } = await getOrgId();
  if (orgError || !orgId) return { error: orgError ?? "Unauthorized" };

  const priceListId = String(formData.get("price_list_id") ?? "").trim();
  if (!priceListId) return { error: "Select a price list first." };

  const { data: selectedList, error: listError } = await supabase
    .from("price_lists")
    .select("id, name, price_type_id, effective_date")
    .eq("organization_id", orgId)
    .eq("id", priceListId)
    .single();
  if (listError || !selectedList) return { error: "Selected price list not found." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "CSV file is required" };
  const rows = parseCsv(await file.text());
  if (rows.length === 0) return { error: "CSV has no data rows" };

  const productsRes = await supabase
    .from("products")
    .select("id, code, name")
    .eq("organization_id", orgId);
  const products = productsRes.error ? [] : (productsRes.data ?? []);
  const productByCode = new Map<string, string>();
  const productByName = new Map<string, string>();
  for (const p of products as Array<{ id: string; code?: string | null; name?: string | null }>) {
    if (p.code) productByCode.set(p.code.toLowerCase(), p.id);
    if (p.name) productByName.set(p.name.toLowerCase(), p.id);
  }

  const typesRes = await supabase
    .from("price_types")
    .select("id, code, name")
    .eq("organization_id", orgId);
  const types = typesRes.error ? [] : (typesRes.data ?? []);
  const typeByLookup = new Map<string, string>();
  for (const t of types as Array<{ id: string; code?: string | null; name?: string | null }>) {
    if (t.name) typeByLookup.set(t.name.toLowerCase(), t.id);
    if (t.code) typeByLookup.set(t.code.toLowerCase(), t.id);
  }

  const selectedName = String(selectedList.name ?? "").trim().toLowerCase();
  const selectedEffective = String(selectedList.effective_date ?? "").trim();
  const selectedType = String(selectedList.price_type_id ?? "");

  const linesByProduct = new Map<string, { price: number; tax_rate: number; vat_type: string }>();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const csvName = String(row.price_list_name || "").trim().toLowerCase();
    if (csvName && csvName !== selectedName) {
      return { error: `Row ${i + 2}: price_list_name does not match selected list.` };
    }

    const csvType = String(row.price_type || "").trim().toLowerCase();
    if (csvType) {
      const csvTypeId = typeByLookup.get(csvType);
      if (!csvTypeId) return { error: `Row ${i + 2}: unknown price_type '${row.price_type}'.` };
      if (csvTypeId !== selectedType) return { error: `Row ${i + 2}: price_type does not match selected list.` };
    }

    const csvEffective = String(row.effective_date || "").trim();
    if (csvEffective && selectedEffective && csvEffective !== selectedEffective) {
      return { error: `Row ${i + 2}: effective_date does not match selected list.` };
    }

    const code = String(row.product_code || "").trim().toLowerCase();
    const name = String(row.product_name || "").trim().toLowerCase();
    const productId = (code && productByCode.get(code)) || (name && productByName.get(name));
    if (!productId) {
      return { error: `Row ${i + 2}: product not found (${row.product_code || row.product_name || "empty"}).` };
    }

    const price = parseNumber(row.price_tax_inc, NaN);
    if (!Number.isFinite(price) || price < 0) {
      return { error: `Row ${i + 2}: invalid price_tax_inc.` };
    }

    linesByProduct.set(productId, {
      price: Number(price.toFixed(2)),
      tax_rate: Number(parseNumber(row.tax_rate, 0).toFixed(2)),
      vat_type: String(row.vat_type || "inc").trim().toLowerCase() === "exc" ? "exc" : "inc",
    });
  }

  if (linesByProduct.size === 0) return { error: "No valid line rows found." };

  const { error: clearError } = await supabase
    .from("price_list_items")
    .delete()
    .eq("organization_id", orgId)
    .eq("price_list_id", priceListId);
  if (clearError) return { error: clearError.message };

  const rowsToInsert = Array.from(linesByProduct.entries()).map(([productId, line]) => ({
    organization_id: orgId,
    price_list_id: priceListId,
    product_id: productId,
    price: line.price,
    tax_rate: line.tax_rate,
    vat_type: line.vat_type,
  }));
  const { error: insertError } = await supabase.from("price_list_items").insert(rowsToInsert);
  if (insertError) return { error: insertError.message };

  revalidatePath("/dashboard/sales/price-list");
  revalidatePath("/dashboard/sales");
  return { ok: true, count: rowsToInsert.length };
}
