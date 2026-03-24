"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type OrderLineInput = {
  row_no: number;
  product_id: string | null;
  item_name_snapshot: string | null;
  price_type: string | null;
  pack_unit: number;
  qty: number;
  cl_qty: number;
  price_ex: number;
  price_tax_inc: number;
  tax_rate: number;
  tax_amount: number;
  value_tax_inc: number;
  vat_type: "inc" | "exc";
};

async function getOrgContext() {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { supabase: ctx.supabase, orgId: null as string | null, error: ctx.error };
  return { supabase: ctx.supabase, orgId: ctx.orgId, error: null as string | null };
}

function parseNumber(value: FormDataEntryValue | null, fallback = 0) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clamp2(n: number) {
  return Number(n.toFixed(2));
}

function clamp6(n: number) {
  return Number(n.toFixed(6));
}

function collectLineIndexes(formData: FormData) {
  const indexes = new Set<string>();
  for (const [key] of formData.entries()) {
    if (key.startsWith("line_product_id_")) indexes.add(key.replace("line_product_id_", ""));
    else if (key.startsWith("line_item_name_")) indexes.add(key.replace("line_item_name_", ""));
  }
  return Array.from(indexes).sort((a, b) => Number(a) - Number(b));
}

function collectLines(formData: FormData): OrderLineInput[] {
  const indexes = collectLineIndexes(formData);
  const lines: OrderLineInput[] = [];
  for (const idx of indexes) {
    const productId = String(formData.get(`line_product_id_${idx}`) ?? "").trim() || null;
    const itemName = String(formData.get(`line_item_name_${idx}`) ?? "").trim() || null;
    const priceType = String(formData.get(`line_price_type_${idx}`) ?? "").trim() || null;
    const qty = clamp2(parseNumber(formData.get(`line_qty_${idx}`), 0));
    const clQty = clamp2(parseNumber(formData.get(`line_cl_qty_${idx}`), 0));
    const packUnit = clamp2(parseNumber(formData.get(`line_pack_unit_${idx}`), 0));
    const priceEx = clamp6(parseNumber(formData.get(`line_price_ex_${idx}`), 0));
    const priceTaxInc = clamp2(parseNumber(formData.get(`line_price_tax_inc_${idx}`), 0));
    const taxRate = clamp2(parseNumber(formData.get(`line_tax_rate_${idx}`), 0));
    const taxAmount = clamp2(parseNumber(formData.get(`line_tax_amount_${idx}`), 0));
    const valueTaxInc = clamp2(parseNumber(formData.get(`line_value_tax_inc_${idx}`), 0));
    const vatType = String(formData.get(`line_vat_type_${idx}`) ?? "inc").trim().toLowerCase() === "exc" ? "exc" : "inc";

    const hasValues = productId || itemName || qty > 0 || clQty > 0 || priceEx > 0 || priceTaxInc > 0 || valueTaxInc > 0;
    if (!hasValues) continue;

    lines.push({
      row_no: Number(idx) || 0,
      product_id: productId,
      item_name_snapshot: itemName,
      price_type: priceType,
      pack_unit: packUnit,
      qty,
      cl_qty: clQty,
      price_ex: priceEx,
      price_tax_inc: priceTaxInc,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      value_tax_inc: valueTaxInc,
      vat_type: vatType,
    });
  }
  return lines;
}

async function generateOrderNo(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, datePrefix: string) {
  const prefix = `SO-${datePrefix}-`;
  const { data } = await supabase
    .from("sales_orders")
    .select("order_no")
    .eq("organization_id", orgId)
    .ilike("order_no", `${prefix}%`)
    .order("order_no", { ascending: false })
    .limit(1);
  const latest = data?.[0]?.order_no ?? "";
  const latestSuffix = latest.startsWith(prefix) ? latest.slice(prefix.length) : "";
  const seq = Number(latestSuffix) || 0;
  return `${prefix}${String(seq + 1).padStart(3, "0")}`;
}

export async function getSuggestedOrderNo(orderDateInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };
  const datePrefix = String(orderDateInput || "").trim().slice(0, 10);
  if (!datePrefix || !/^\d{4}-\d{2}-\d{2}$/.test(datePrefix)) return { error: "Valid order date is required." };
  const orderNo = await generateOrderNo(supabase, orgId, datePrefix);
  return { ok: true, orderNo };
}

export async function saveSalesOrder(formData: FormData) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(formData.get("id") ?? "").trim() || null;
  const customerId = String(formData.get("customer_id") ?? "").trim() || null;
  const salesRepId = String(formData.get("sales_rep_id") ?? "").trim() || null;
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const orderDate = String(formData.get("order_date") ?? "").trim();
  const deliveryDate = String(formData.get("delivery_date") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const orderNoInput = String(formData.get("order_no") ?? "").trim() || null;

  if (!customerId) return { error: "Customer is required." };
  if (!orderDate) return { error: "Order date is required." };

  const lines = collectLines(formData);
  if (lines.length === 0) return { error: "Add at least one order line." };
  if (lines.some((line) => !line.product_id)) return { error: "Each line must have a valid product." };

  const totalQty = clamp2(lines.reduce((sum, line) => sum + line.qty + line.cl_qty, 0));
  const taxTotal = clamp2(lines.reduce((sum, line) => sum + line.tax_amount, 0));
  const grandTotal = clamp2(lines.reduce((sum, line) => sum + line.value_tax_inc, 0));
  const subTotal = clamp2(grandTotal - taxTotal);

  let orderId = id;
  let orderNo = orderNoInput;

  if (orderId) {
    const { data: existing } = await supabase
      .from("sales_orders")
      .select("id, order_no")
      .eq("organization_id", orgId)
      .eq("id", orderId)
      .single();
    if (!existing) return { error: "Order not found." };
    orderNo = orderNo || (existing.order_no as string);
    const { error: updateError } = await supabase
      .from("sales_orders")
      .update({
        order_no: orderNo,
        customer_id: customerId,
        sales_rep_id: salesRepId,
        location_id: locationId,
        order_date: orderDate,
        delivery_date: deliveryDate,
        notes,
        total_qty: totalQty,
        sub_total: subTotal,
        tax_total: taxTotal,
        grand_total: grandTotal,
      })
      .eq("organization_id", orgId)
      .eq("id", orderId);
    if (updateError) return { error: updateError.message };
  } else {
    const datePrefix = (orderDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
    if (!orderNo) orderNo = await generateOrderNo(supabase, orgId, datePrefix);
    const { data: inserted, error: insertError } = await supabase
      .from("sales_orders")
      .insert({
        organization_id: orgId,
        order_no: orderNo,
        customer_id: customerId,
        sales_rep_id: salesRepId,
        location_id: locationId,
        order_date: orderDate,
        delivery_date: deliveryDate,
        notes,
        total_qty: totalQty,
        sub_total: subTotal,
        tax_total: taxTotal,
        grand_total: grandTotal,
      })
      .select("id")
      .single();
    if (insertError) return { error: insertError.message };
    orderId = inserted?.id ?? null;
    if (!orderId) return { error: "Failed to create order." };
  }

  const { error: clearError } = await supabase
    .from("sales_order_lines")
    .delete()
    .eq("organization_id", orgId)
    .eq("sales_order_id", orderId);
  if (clearError) return { error: clearError.message };

  const rows = lines.map((line) => ({
    organization_id: orgId,
    sales_order_id: orderId!,
    product_id: line.product_id,
    item_name_snapshot: line.item_name_snapshot,
    price_type: line.price_type,
    pack_unit: line.pack_unit,
    qty: line.qty,
    cl_qty: line.cl_qty,
    price_ex: line.price_ex,
    price_tax_inc: line.price_tax_inc,
    tax_rate: line.tax_rate,
    tax_amount: line.tax_amount,
    value_tax_inc: line.value_tax_inc,
    vat_type: line.vat_type,
    row_no: line.row_no,
  }));

  const { error: insertLinesError } = await supabase.from("sales_order_lines").insert(rows);
  if (insertLinesError) return { error: insertLinesError.message };

  revalidatePath("/dashboard/sales/sales-orders");
  revalidatePath("/dashboard/sales");
  return { ok: true, id: orderId };
}

export type SalesOrdersReferenceData = {
  products: { id: string; code?: string | null; name: string; pack_unit?: number | null }[];
  customers: {
    id: string;
    tax_id?: string | null;
    name: string;
    sales_rep_id?: string | null;
    price_type?: string | null;
    location_id?: string | null;
  }[];
  salesReps: { id: string; code?: string | null; name: string }[];
  locations: { id: string; code?: string | null; name: string }[];
  priceTypes: { id: string; code?: string | null; name: string }[];
  priceLists: {
    id: string;
    price_type_id: string;
    effective_date?: string | null;
    expiry_date?: string | null;
    is_active?: boolean | null;
    price_types?: { name?: string | null } | null;
  }[];
  priceListItems: {
    price_list_id: string;
    product_id: string | number;
    price?: number | null;
    tax_rate?: number | null;
    vat_type?: string | null;
  }[];
  invoices: {
    customer_id?: string | null;
    invoice_date?: string;
    location_id?: string | null;
    balance_os?: number | null;
  }[];
};

/** Loaded from the client so the Sales Orders page shell can render without blocking on many parallel queries. */
export async function loadSalesOrdersReferenceData(): Promise<
  { ok: true; data: SalesOrdersReferenceData } | { ok: false; error: string }
> {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { ok: false, error: error ?? "Unauthorized" };

  const productsRes = await supabase
    .from("products")
    .select("id, code, name, pack_unit")
    .eq("organization_id", orgId)
    .order("name");

  // All org customers for pickers (no is_active filter — avoids PostgREST .or() errors and includes every row)
  const customersRes = await supabase
    .from("customers")
    .select("id, tax_id, name, sales_rep_id, price_type, location_id")
    .eq("organization_id", orgId)
    .order("name")
    .limit(5000);

  const repsRes = await supabase
    .from("sales_reps")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");

  const locationsRes = await supabase
    .from("locations")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("code");

  const priceTypesRes = await supabase
    .from("price_types")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("code");

  const priceListsRes = await supabase
    .from("price_lists")
    .select("id, price_type_id, effective_date, expiry_date, is_active, price_types(name)")
    .eq("organization_id", orgId)
    .eq("is_active", true);

  const priceListItemsRes = await supabase
    .from("price_list_items")
    .select("price_list_id, product_id, price, tax_rate, vat_type")
    .eq("organization_id", orgId);

  const invoicesRes = await supabase
    .from("sales_invoices")
    .select("customer_id, invoice_date, location_id, balance_os")
    .eq("organization_id", orgId);

  const empty = (res: { data?: unknown; error?: unknown }) => Boolean(res.error);

  return {
    ok: true,
    data: {
      products: (empty(productsRes) ? [] : productsRes.data ?? []) as SalesOrdersReferenceData["products"],
      customers: (empty(customersRes) ? [] : customersRes.data ?? []) as SalesOrdersReferenceData["customers"],
      salesReps: (empty(repsRes) ? [] : repsRes.data ?? []) as SalesOrdersReferenceData["salesReps"],
      locations: (empty(locationsRes) ? [] : locationsRes.data ?? []) as SalesOrdersReferenceData["locations"],
      priceTypes: (empty(priceTypesRes) ? [] : priceTypesRes.data ?? []) as SalesOrdersReferenceData["priceTypes"],
      priceLists: (empty(priceListsRes) ? [] : priceListsRes.data ?? []) as SalesOrdersReferenceData["priceLists"],
      priceListItems: (empty(priceListItemsRes) ? [] : priceListItemsRes.data ?? []) as SalesOrdersReferenceData["priceListItems"],
      invoices: (empty(invoicesRes) ? [] : invoicesRes.data ?? []) as SalesOrdersReferenceData["invoices"],
    },
  };
}

export async function deleteSalesOrder(id: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };
  const orderId = String(id ?? "").trim();
  if (!orderId) return { error: "Missing order id." };
  const { data: existing } = await supabase
    .from("sales_orders")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", orderId)
    .single();
  if (!existing) return { error: "Order not found." };
  const { error: lineDeleteError } = await supabase
    .from("sales_order_lines")
    .delete()
    .eq("organization_id", orgId)
    .eq("sales_order_id", orderId);
  if (lineDeleteError) return { error: lineDeleteError.message };
  const { error: deleteError } = await supabase
    .from("sales_orders")
    .delete()
    .eq("organization_id", orgId)
    .eq("id", orderId);
  if (deleteError) return { error: deleteError.message };
  revalidatePath("/dashboard/sales/sales-orders");
  revalidatePath("/dashboard/sales");
  return { ok: true };
}
