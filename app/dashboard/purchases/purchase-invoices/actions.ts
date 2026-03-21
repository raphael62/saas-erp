"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type PurchaseLineInput = {
  row_no: number;
  product_id: string | null;
  item_name_snapshot: string | null;
  pack_unit: number;
  btl_qty: number;
  ctn_qty: number;
  btl_gross_bill: number;
  btl_gross_value: number;
  price_ex: number;
  pre_tax: number;
  tax_amount: number;
  price_tax_inc: number;
  tax_inc_value: number;
  empties_value: number;
};

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

function parseNumber(value: FormDataEntryValue | null, fallback = 0) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clamp2(n: number) {
  return Number(n.toFixed(2));
}

function clamp4(n: number) {
  return Number(n.toFixed(4));
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

function collectLines(formData: FormData): PurchaseLineInput[] {
  const indexes = collectLineIndexes(formData);
  const lines: PurchaseLineInput[] = [];
  for (const idx of indexes) {
    const productId = String(formData.get(`line_product_id_${idx}`) ?? "").trim() || null;
    const itemName = String(formData.get(`line_item_name_${idx}`) ?? "").trim() || null;

    const packUnit = clamp2(parseNumber(formData.get(`line_pack_unit_${idx}`), 0));
    const btlQty = clamp2(parseNumber(formData.get(`line_btl_qty_${idx}`), 0));
    const ctnQty = clamp4(parseNumber(formData.get(`line_ctn_qty_${idx}`), 0));
    const btlGrossBill = clamp2(parseNumber(formData.get(`line_btl_gross_bill_${idx}`), 0));
    const btlGrossValue = clamp2(parseNumber(formData.get(`line_btl_gross_value_${idx}`), 0));
    const priceEx = clamp6(parseNumber(formData.get(`line_price_ex_${idx}`), 0));
    const preTax = clamp2(parseNumber(formData.get(`line_pre_tax_${idx}`), 0));
    const taxAmount = clamp2(parseNumber(formData.get(`line_tax_amount_${idx}`), 0));
    const priceTaxInc = clamp2(parseNumber(formData.get(`line_price_tax_inc_${idx}`), 0));
    const taxIncValue = clamp2(parseNumber(formData.get(`line_tax_inc_value_${idx}`), 0));
    const emptiesValue = clamp2(parseNumber(formData.get(`line_empties_value_${idx}`), 0));

    const hasValues =
      productId ||
      itemName ||
      btlQty > 0 ||
      ctnQty > 0 ||
      priceEx > 0 ||
      priceTaxInc > 0 ||
      taxIncValue > 0 ||
      emptiesValue > 0;
    if (!hasValues) continue;

    lines.push({
      row_no: Number(idx) || 0,
      product_id: productId,
      item_name_snapshot: itemName,
      pack_unit: packUnit,
      btl_qty: btlQty,
      ctn_qty: ctnQty,
      btl_gross_bill: btlGrossBill,
      btl_gross_value: btlGrossValue,
      price_ex: priceEx,
      pre_tax: preTax,
      tax_amount: taxAmount,
      price_tax_inc: priceTaxInc,
      tax_inc_value: taxIncValue,
      empties_value: emptiesValue,
    });
  }
  return lines;
}

function aggregateProductQty(lines: Array<{ product_id: string | null; ctn_qty?: number | null }>) {
  const map = new Map<string, number>();
  for (const line of lines) {
    if (!line.product_id) continue;
    const qty = clamp4(Number(line.ctn_qty ?? 0));
    if (!qty) continue;
    map.set(String(line.product_id), clamp4((map.get(String(line.product_id)) ?? 0) + qty));
  }
  return map;
}

function subtractMaps(a: Map<string, number>, b: Map<string, number>) {
  const out = new Map<string, number>();
  const keys = new Set<string>([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    const diff = clamp4((a.get(key) ?? 0) - (b.get(key) ?? 0));
    if (diff !== 0) out.set(key, diff);
  }
  return out;
}

async function applyStockDelta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  qtyInDeltaByProduct: Map<string, number>
) {
  for (const [productId, deltaQty] of qtyInDeltaByProduct.entries()) {
    if (!deltaQty) continue;
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, stock_quantity")
      .eq("organization_id", orgId)
      .eq("id", productId)
      .single();
    if (productError || !product) return { error: `Product not found for stock update (${productId}).` };

    const currentStock = Number(product.stock_quantity ?? 0);
    const nextStock = clamp2(currentStock + deltaQty);
    const { error: stockError } = await supabase
      .from("products")
      .update({ stock_quantity: nextStock })
      .eq("organization_id", orgId)
      .eq("id", productId);
    if (stockError) return { error: stockError.message };
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
    .from("purchase_invoices")
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

function incrementNumericString(raw: string) {
  const value = String(raw ?? "").trim();
  if (!/^\d+$/.test(value)) return null;
  return String(Number(value) + 1).padStart(value.length, "0");
}

export async function savePurchaseInvoice(formData: FormData) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(formData.get("id") ?? "").trim() || null;
  const supplierId = String(formData.get("supplier_id") ?? "").trim() || null;
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const invoiceDate = String(formData.get("invoice_date") ?? "").trim();
  const deliveryDate = String(formData.get("delivery_date") ?? "").trim() || null;
  const dueDate = String(formData.get("due_date") ?? "").trim() || null;
  const paymentDate = String(formData.get("payment_date") ?? "").trim() || null;
  const invoiceNoInput = String(formData.get("invoice_no") ?? "").trim() || null;
  const supplierInvNo = String(formData.get("supplier_inv_no") ?? "").trim() || null;
  const emptiesInvNoInput = String(formData.get("empties_inv_no") ?? "").trim() || null;
  const piNo = String(formData.get("pi_no") ?? "").trim() || null;
  const deliveryNoteNo = String(formData.get("delivery_note_no") ?? "").trim() || null;
  const transporter = String(formData.get("transporter") ?? "").trim() || null;
  const driverName = String(formData.get("driver_name") ?? "").trim() || null;
  const vehicleNo = String(formData.get("vehicle_no") ?? "").trim() || null;
  const printQty = String(formData.get("print_qty") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!supplierId) return { error: "Supplier is required." };
  if (!invoiceDate) return { error: "Invoice date is required." };
  if (!locationId) return { error: "Location is required." };

  const lines = collectLines(formData);
  const hasReturnables = lines.some((line) => line.empties_value > 0);
  const emptiesInvNo =
    hasReturnables && supplierInvNo
      ? incrementNumericString(supplierInvNo) ?? emptiesInvNoInput
      : emptiesInvNoInput;

  if (lines.length === 0) return { error: "Add at least one invoice line." };
  if (lines.some((line) => !line.product_id)) return { error: "Each line must have a valid product." };

  const totalQty = clamp4(lines.reduce((sum, line) => sum + line.ctn_qty, 0));
  const subTotal = clamp2(lines.reduce((sum, line) => sum + line.pre_tax, 0));
  const taxTotal = clamp2(lines.reduce((sum, line) => sum + line.tax_amount, 0));
  const grandTotal = clamp2(lines.reduce((sum, line) => sum + line.tax_inc_value, 0));
  const balanceOs = grandTotal;

  let invoiceId = id;
  let invoiceNo = invoiceNoInput;
  let previousLines: Array<{ product_id: string | null; ctn_qty?: number | null }> = [];

  if (invoiceId) {
    const { data: existing } = await supabase
      .from("purchase_invoices")
      .select("id, invoice_no")
      .eq("organization_id", orgId)
      .eq("id", invoiceId)
      .single();
    if (!existing) return { error: "Invoice not found." };
    invoiceNo = invoiceNo || (existing.invoice_no as string);

    const previousLinesRes = await supabase
      .from("purchase_invoice_lines")
      .select("product_id, ctn_qty")
      .eq("organization_id", orgId)
      .eq("purchase_invoice_id", invoiceId);
    if (previousLinesRes.error) return { error: previousLinesRes.error.message };
    previousLines = previousLinesRes.data ?? [];

    const { error: updateError } = await supabase
      .from("purchase_invoices")
      .update({
        invoice_no: invoiceNo,
        supplier_id: supplierId,
        location_id: locationId,
        invoice_date: invoiceDate,
        delivery_date: deliveryDate,
        due_date: dueDate,
        payment_date: paymentDate,
        supplier_inv_no: supplierInvNo,
        empties_inv_no: emptiesInvNo,
        pi_no: piNo,
        delivery_note_no: deliveryNoteNo,
        transporter,
        driver_name: driverName,
        vehicle_no: vehicleNo,
        print_qty: printQty,
        notes,
        balance_os: balanceOs,
        total_qty: totalQty,
        sub_total: subTotal,
        tax_total: taxTotal,
        grand_total: grandTotal,
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
      .from("purchase_invoices")
      .insert({
        organization_id: orgId,
        invoice_no: invoiceNo,
        supplier_id: supplierId,
        location_id: locationId,
        invoice_date: invoiceDate,
        delivery_date: deliveryDate,
        due_date: dueDate,
        payment_date: paymentDate,
        supplier_inv_no: supplierInvNo,
        empties_inv_no: emptiesInvNo,
        pi_no: piNo,
        delivery_note_no: deliveryNoteNo,
        transporter,
        driver_name: driverName,
        vehicle_no: vehicleNo,
        print_qty: printQty,
        notes,
        balance_os: balanceOs,
        total_qty: totalQty,
        sub_total: subTotal,
        tax_total: taxTotal,
        grand_total: grandTotal,
      })
      .select("id")
      .single();
    if (insertError) return { error: insertError.message };
    invoiceId = inserted?.id ?? null;
    if (!invoiceId) return { error: "Failed to create invoice." };
  }

  const { error: clearError } = await supabase
    .from("purchase_invoice_lines")
    .delete()
    .eq("organization_id", orgId)
    .eq("purchase_invoice_id", invoiceId);
  if (clearError) return { error: clearError.message };

  const rows = lines.map((line) => ({
    organization_id: orgId,
    purchase_invoice_id: invoiceId!,
    product_id: line.product_id,
    item_name_snapshot: line.item_name_snapshot,
    pack_unit: line.pack_unit,
    btl_qty: line.btl_qty,
    ctn_qty: line.ctn_qty,
    btl_gross_bill: line.btl_gross_bill,
    btl_gross_value: line.btl_gross_value,
    price_ex: line.price_ex,
    pre_tax: line.pre_tax,
    tax_amount: line.tax_amount,
    price_tax_inc: line.price_tax_inc,
    tax_inc_value: line.tax_inc_value,
    empties_value: line.empties_value,
    row_no: line.row_no,
  }));
  const { error: insertLinesError } = await supabase.from("purchase_invoice_lines").insert(rows);
  if (insertLinesError) return { error: insertLinesError.message };

  const prevStock = aggregateProductQty(previousLines);
  const nextStock = aggregateProductQty(lines);
  const stockDelta = subtractMaps(nextStock, prevStock);
  const stockResult = await applyStockDelta(supabase, orgId, stockDelta);
  if ("error" in stockResult && stockResult.error) return { error: stockResult.error };

  revalidatePath("/dashboard/purchases/purchase-invoices");
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/inventory/stocks-by-location");
  return { ok: true, id: invoiceId };
}

export async function deletePurchaseInvoice(id: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const invoiceId = String(id ?? "").trim();
  if (!invoiceId) return { error: "Missing invoice id." };

  const { data: existing } = await supabase
    .from("purchase_invoices")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", invoiceId)
    .single();
  if (!existing) return { error: "Invoice not found." };

  const previousLinesRes = await supabase
    .from("purchase_invoice_lines")
    .select("product_id, ctn_qty")
    .eq("organization_id", orgId)
    .eq("purchase_invoice_id", invoiceId);
  if (previousLinesRes.error) return { error: previousLinesRes.error.message };
  const previousLines = previousLinesRes.data ?? [];

  const { error: lineDeleteError } = await supabase
    .from("purchase_invoice_lines")
    .delete()
    .eq("organization_id", orgId)
    .eq("purchase_invoice_id", invoiceId);
  if (lineDeleteError) return { error: lineDeleteError.message };

  const { error: deleteError } = await supabase
    .from("purchase_invoices")
    .delete()
    .eq("organization_id", orgId)
    .eq("id", invoiceId);
  if (deleteError) return { error: deleteError.message };

  const prevStock = aggregateProductQty(previousLines);
  const reverseStockDelta = new Map<string, number>();
  for (const [productId, qty] of prevStock.entries()) reverseStockDelta.set(productId, clamp4(-qty));
  const stockResult = await applyStockDelta(supabase, orgId, reverseStockDelta);
  if ("error" in stockResult && stockResult.error) return { error: stockResult.error };

  revalidatePath("/dashboard/purchases/purchase-invoices");
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/inventory/stocks-by-location");
  return { ok: true };
}
