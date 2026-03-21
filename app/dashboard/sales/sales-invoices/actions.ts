"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type InvoiceLineInput = {
  row_no: number;
  product_id: string | null;
  item_name_snapshot: string | null;
  price_type: string | null;
  pack_unit: number;
  qty: number;
  cl_qty: number;
  free_qty: number;
  price_ex: number;
  price_tax_inc: number;
  tax_rate: number;
  tax_amount: number;
  value_tax_inc: number;
  vat_type: "inc" | "exc";
};

async function getOrgContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, orgId: null as string | null, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id?: string } | null)?.organization_id ?? null;
  if (!orgId) return { supabase, user, orgId: null as string | null, error: "No organization" };

  return { supabase, user, orgId, error: null as string | null };
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

function normalizeVatType(value: string) {
  return value.trim().toLowerCase() === "exc" ? "exc" : "inc";
}

function collectLineIndexes(formData: FormData) {
  const indexes = new Set<string>();
  for (const [key] of formData.entries()) {
    if (key.startsWith("line_product_id_")) indexes.add(key.replace("line_product_id_", ""));
    else if (key.startsWith("line_item_name_")) indexes.add(key.replace("line_item_name_", ""));
  }
  return Array.from(indexes).sort((a, b) => Number(a) - Number(b));
}

function collectLines(formData: FormData): InvoiceLineInput[] {
  const indexes = collectLineIndexes(formData);
  const lines: InvoiceLineInput[] = [];
  for (const idx of indexes) {
    const productId = String(formData.get(`line_product_id_${idx}`) ?? "").trim() || null;
    const itemName = String(formData.get(`line_item_name_${idx}`) ?? "").trim() || null;
    const priceType = String(formData.get(`line_price_type_${idx}`) ?? "").trim() || null;

    const qty = clamp2(parseNumber(formData.get(`line_qty_${idx}`), 0));
    const clQty = clamp2(parseNumber(formData.get(`line_cl_qty_${idx}`), 0));
    const freeQty = clamp2(parseNumber(formData.get(`line_free_qty_${idx}`), 0));
    const packUnit = clamp2(parseNumber(formData.get(`line_pack_unit_${idx}`), 0));
    const priceEx = clamp6(parseNumber(formData.get(`line_price_ex_${idx}`), 0));
    const priceTaxInc = clamp2(parseNumber(formData.get(`line_price_tax_inc_${idx}`), 0));
    const taxRate = clamp2(parseNumber(formData.get(`line_tax_rate_${idx}`), 0));
    const taxAmount = clamp2(parseNumber(formData.get(`line_tax_amount_${idx}`), 0));
    const valueTaxInc = clamp2(parseNumber(formData.get(`line_value_tax_inc_${idx}`), 0));
    const vatType = normalizeVatType(String(formData.get(`line_vat_type_${idx}`) ?? "inc"));

    const hasValues =
      productId ||
      itemName ||
      qty > 0 ||
      clQty > 0 ||
      freeQty > 0 ||
      priceEx > 0 ||
      priceTaxInc > 0 ||
      valueTaxInc > 0;
    if (!hasValues) continue;

    lines.push({
      row_no: Number(idx) || 0,
      product_id: productId,
      item_name_snapshot: itemName,
      price_type: priceType,
      pack_unit: packUnit,
      qty,
      cl_qty: clQty,
      free_qty: freeQty,
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

type ExistingLine = {
  product_id: string | null;
  cl_qty: number | null;
  free_qty: number | null;
  item_name_snapshot?: string | null;
};

function aggregateProductQty(lines: Array<{ product_id: string | null; cl_qty?: number | null; free_qty?: number | null }>) {
  const map = new Map<string, number>();
  for (const line of lines) {
    if (!line.product_id) continue;
    const qtyOut = clamp2(Number(line.cl_qty ?? 0) + Number(line.free_qty ?? 0));
    if (qtyOut === 0) continue;
    const key = String(line.product_id);
    map.set(key, clamp2((map.get(key) ?? 0) + qtyOut));
  }
  return map;
}

function aggregatePromoConsumed(lines: Array<{ item_name_snapshot?: string | null; cl_qty?: number | null }>) {
  const map = new Map<string, number>();
  for (const line of lines) {
    const itemName = String(line.item_name_snapshot ?? "").trim();
    if (!itemName.startsWith("[PROMO]")) continue;
    const afterPrefix = itemName.replace(/^\[PROMO\]\s*/i, "");
    const promoCode = afterPrefix.split(" - ")[0]?.trim();
    if (!promoCode) continue;
    const qtyCartons = Number(line.cl_qty ?? 0);
    if (!Number.isFinite(qtyCartons) || qtyCartons <= 0) continue;
    map.set(promoCode, clamp6((map.get(promoCode) ?? 0) + qtyCartons));
  }
  return map;
}

function subtractMaps(a: Map<string, number>, b: Map<string, number>) {
  const out = new Map<string, number>();
  const keys = new Set<string>([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    const diff = clamp6((a.get(key) ?? 0) - (b.get(key) ?? 0));
    if (diff !== 0) out.set(key, diff);
  }
  return out;
}

async function applyStockDelta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  qtyOutDeltaByProduct: Map<string, number>
) {
  for (const [productId, deltaQtyOut] of qtyOutDeltaByProduct.entries()) {
    if (!deltaQtyOut) continue;
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, stock_quantity")
      .eq("organization_id", orgId)
      .eq("id", productId)
      .single();
    if (productError || !product) return { error: `Product not found for stock update (${productId}).` };

    // deltaQtyOut > 0 means stock should reduce. deltaQtyOut < 0 means stock should increase back.
    const currentStock = Number(product.stock_quantity ?? 0);
    const nextStock = clamp2(currentStock - deltaQtyOut);
    const { error: stockError } = await supabase
      .from("products")
      .update({ stock_quantity: nextStock })
      .eq("organization_id", orgId)
      .eq("id", productId);
    if (stockError) return { error: stockError.message };
  }
  return { ok: true };
}

async function applyPromoConsumedDelta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  consumedDeltaByCode: Map<string, number>
) {
  if (consumedDeltaByCode.size === 0) return { ok: true };
  const promoCodes = Array.from(consumedDeltaByCode.keys());
  const { data: promos, error: promosError } = await supabase
    .from("promotions")
    .select("id, promo_code, consumed_cartons")
    .eq("organization_id", orgId)
    .in("promo_code", promoCodes);
  if (promosError) return { error: promosError.message };

  for (const promo of promos ?? []) {
    const code = String((promo as { promo_code?: string }).promo_code ?? "");
    const delta = consumedDeltaByCode.get(code) ?? 0;
    if (!delta) continue;
    const current = Number((promo as { consumed_cartons?: number }).consumed_cartons ?? 0);
    const nextConsumed = clamp6(Math.max(0, current + delta));
    const { error: promoUpdateError } = await supabase
      .from("promotions")
      .update({ consumed_cartons: nextConsumed })
      .eq("organization_id", orgId)
      .eq("id", (promo as { id: string }).id);
    if (promoUpdateError) return { error: promoUpdateError.message };
  }
  return { ok: true };
}

async function generateInvoiceNo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  datePrefix: string
) {
  const prefix = `${datePrefix}-`;

  const { data } = await supabase
    .from("sales_invoices")
    .select("invoice_no")
    .eq("organization_id", orgId)
    .ilike("invoice_no", `${prefix}%`)
    .order("invoice_no", { ascending: false })
    .limit(1);

  const latest = data?.[0]?.invoice_no ?? "";
  const latestSuffix = latest.startsWith(prefix) ? latest.slice(prefix.length) : "";
  const seq = Number(latestSuffix) || 0;
  return `${prefix}${String(seq + 1).padStart(3, "0")}`;
}

export async function getSuggestedInvoiceNo(deliveryDateInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const datePrefix = String(deliveryDateInput || "").trim().slice(0, 10);
  if (!datePrefix || !/^\d{4}-\d{2}-\d{2}$/.test(datePrefix)) {
    return { error: "Valid delivery date is required." };
  }

  const invoiceNo = await generateInvoiceNo(supabase, orgId, datePrefix);
  return { ok: true, invoiceNo };
}

export async function saveSalesInvoice(formData: FormData) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(formData.get("id") ?? "").trim() || null;
  const customerId = String(formData.get("customer_id") ?? "").trim() || null;
  const salesRepId = String(formData.get("sales_rep_id") ?? "").trim() || null;
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const invoiceDate = String(formData.get("invoice_date") ?? "").trim();
  const deliveryDate = String(formData.get("delivery_date") ?? "").trim() || null;
  const vatInvoiceNo = String(formData.get("vat_invoice_no") ?? "").trim() || null;
  const paymentTerms = String(formData.get("payment_terms") ?? "").trim() || null;
  const driverName = String(formData.get("driver_name") ?? "").trim() || null;
  const vehicleNo = String(formData.get("vehicle_no") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const invoiceNoInput = String(formData.get("invoice_no") ?? "").trim() || null;

  if (!customerId) return { error: "Customer is required." };
  if (!invoiceDate) return { error: "Invoice date is required." };

  const lines = collectLines(formData);
  if (lines.length === 0) return { error: "Add at least one invoice line." };
  if (lines.some((line) => !line.product_id)) return { error: "Each line must have a valid product." };

  const totalQty = clamp2(lines.reduce((sum, line) => sum + line.cl_qty + line.free_qty, 0));
  const subTotal = clamp2(lines.reduce((sum, line) => sum + line.price_ex * (line.cl_qty + line.free_qty), 0));
  const taxTotal = clamp2(lines.reduce((sum, line) => sum + line.tax_amount, 0));
  const grandTotal = clamp2(lines.reduce((sum, line) => sum + line.value_tax_inc, 0));
  const balanceOs = grandTotal;

  let invoiceId = id;
  let invoiceNo = invoiceNoInput;
  let previousLines: ExistingLine[] = [];

  if (invoiceId) {
    const { data: existing } = await supabase
      .from("sales_invoices")
      .select("id, invoice_no")
      .eq("organization_id", orgId)
      .eq("id", invoiceId)
      .single();

    if (!existing) return { error: "Invoice not found." };
    invoiceNo = invoiceNo || (existing.invoice_no as string);

    const previousLinesRes = await supabase
      .from("sales_invoice_lines")
      .select("product_id, cl_qty, free_qty, item_name_snapshot")
      .eq("organization_id", orgId)
      .eq("sales_invoice_id", invoiceId);
    if (previousLinesRes.error) return { error: previousLinesRes.error.message };
    previousLines = (previousLinesRes.data ?? []) as ExistingLine[];

    const { error: updateError } = await supabase
      .from("sales_invoices")
      .update({
        invoice_no: invoiceNo,
        customer_id: customerId,
        sales_rep_id: salesRepId,
        location_id: locationId,
        invoice_date: invoiceDate,
        delivery_date: deliveryDate,
        vat_invoice_no: vatInvoiceNo,
        payment_terms: paymentTerms,
        driver_name: driverName,
        vehicle_no: vehicleNo,
        notes,
        type_status: "saved",
        posted_at: null,
        posted_by: null,
        total_qty: totalQty,
        sub_total: subTotal,
        tax_total: taxTotal,
        grand_total: grandTotal,
        balance_os: balanceOs,
      })
      .eq("organization_id", orgId)
      .eq("id", invoiceId);
    if (updateError) return { error: updateError.message };
  } else {
    if (!invoiceNo) {
      const datePrefix = (deliveryDate || invoiceDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
      invoiceNo = await generateInvoiceNo(supabase, orgId, datePrefix);
    }
    const { data: inserted, error: insertError } = await supabase
      .from("sales_invoices")
      .insert({
        organization_id: orgId,
        invoice_no: invoiceNo,
        customer_id: customerId,
        sales_rep_id: salesRepId,
        location_id: locationId,
        invoice_date: invoiceDate,
        delivery_date: deliveryDate,
        vat_invoice_no: vatInvoiceNo,
        payment_terms: paymentTerms,
        driver_name: driverName,
        vehicle_no: vehicleNo,
        notes,
        type_status: "saved",
        posted_at: null,
        posted_by: null,
        total_qty: totalQty,
        sub_total: subTotal,
        tax_total: taxTotal,
        grand_total: grandTotal,
        balance_os: balanceOs,
      })
      .select("id")
      .single();
    if (insertError) return { error: insertError.message };
    invoiceId = inserted?.id ?? null;
    if (!invoiceId) return { error: "Failed to create invoice." };
  }

  const { error: clearError } = await supabase
    .from("sales_invoice_lines")
    .delete()
    .eq("organization_id", orgId)
    .eq("sales_invoice_id", invoiceId);
  if (clearError) return { error: clearError.message };

  const rows = lines.map((line) => ({
    organization_id: orgId,
    sales_invoice_id: invoiceId!,
    product_id: line.product_id,
    item_name_snapshot: line.item_name_snapshot,
    price_type: line.price_type,
    pack_unit: line.pack_unit,
    qty: line.qty,
    cl_qty: line.cl_qty,
    free_qty: line.free_qty,
    price_ex: line.price_ex,
    price_tax_inc: line.price_tax_inc,
    tax_rate: line.tax_rate,
    tax_amount: line.tax_amount,
    value_tax_inc: line.value_tax_inc,
    vat_type: line.vat_type,
    row_no: line.row_no,
  }));

  const { error: insertLinesError } = await supabase.from("sales_invoice_lines").insert(rows);
  if (insertLinesError) return { error: insertLinesError.message };

  const prevStock = aggregateProductQty(previousLines);
  const nextStock = aggregateProductQty(lines);
  const stockDelta = subtractMaps(nextStock, prevStock);
  const stockResult = await applyStockDelta(supabase, orgId, stockDelta);
  if ("error" in stockResult && stockResult.error) return { error: stockResult.error };

  const prevPromo = aggregatePromoConsumed(previousLines);
  const nextPromo = aggregatePromoConsumed(lines);
  const promoDelta = subtractMaps(nextPromo, prevPromo);
  const promoResult = await applyPromoConsumedDelta(supabase, orgId, promoDelta);
  if ("error" in promoResult && promoResult.error) return { error: promoResult.error };

  revalidatePath("/dashboard/sales/sales-invoices");
  revalidatePath("/dashboard/sales/promotions");
  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/inventory/stocks-by-location");
  return { ok: true, id: invoiceId };
}

export async function deleteSalesInvoice(id: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const invoiceId = String(id ?? "").trim();
  if (!invoiceId) return { error: "Missing invoice id." };

  const { data: existing } = await supabase
    .from("sales_invoices")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", invoiceId)
    .single();
  if (!existing) return { error: "Invoice not found." };

  const previousLinesRes = await supabase
    .from("sales_invoice_lines")
    .select("product_id, cl_qty, free_qty, item_name_snapshot")
    .eq("organization_id", orgId)
    .eq("sales_invoice_id", invoiceId);
  if (previousLinesRes.error) return { error: previousLinesRes.error.message };
  const previousLines = (previousLinesRes.data ?? []) as ExistingLine[];

  const { error: lineDeleteError } = await supabase
    .from("sales_invoice_lines")
    .delete()
    .eq("organization_id", orgId)
    .eq("sales_invoice_id", invoiceId);
  if (lineDeleteError) return { error: lineDeleteError.message };

  const { error: deleteError } = await supabase
    .from("sales_invoices")
    .delete()
    .eq("organization_id", orgId)
    .eq("id", invoiceId);
  if (deleteError) return { error: deleteError.message };

  const prevStock = aggregateProductQty(previousLines);
  const reverseStockDelta = new Map<string, number>();
  for (const [productId, qtyOut] of prevStock.entries()) reverseStockDelta.set(productId, clamp2(-qtyOut));
  const stockResult = await applyStockDelta(supabase, orgId, reverseStockDelta);
  if ("error" in stockResult && stockResult.error) return { error: stockResult.error };

  const prevPromo = aggregatePromoConsumed(previousLines);
  const reversePromoDelta = new Map<string, number>();
  for (const [code, qty] of prevPromo.entries()) reversePromoDelta.set(code, clamp6(-qty));
  const promoResult = await applyPromoConsumedDelta(supabase, orgId, reversePromoDelta);
  if ("error" in promoResult && promoResult.error) return { error: promoResult.error };

  revalidatePath("/dashboard/sales/sales-invoices");
  revalidatePath("/dashboard/sales/promotions");
  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/inventory/stocks-by-location");
  return { ok: true };
}

export async function postSalesInvoice(id: string) {
  void id;
  return { error: "Posting is not used. Saving Sales Invoice already updates stock and balances." };
}
