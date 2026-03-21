"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ReceiveLineInput = {
  row_no: number;
  product_id: string | null;
  product_code_snapshot: string | null;
  product_name_snapshot: string | null;
  sold_qty: number;
  owed_qty: number;
  expected_qty: number;
  received_qty: number;
  os_qty: number;
};

type SnapshotRow = {
  product_id: string;
  product_code: string;
  product_name: string;
  sold_qty: number;
  owed_qty: number;
  expected_qty: number;
  received_qty: number;
  os_qty: number;
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
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

function clamp2(value: number) {
  return Number(value.toFixed(2));
}

function clamp4(value: number) {
  return Number(value.toFixed(4));
}

function collectLineIndexes(formData: FormData) {
  const indexes = new Set<string>();
  for (const [key] of formData.entries()) {
    if (key.startsWith("line_product_id_")) indexes.add(key.replace("line_product_id_", ""));
    else if (key.startsWith("line_product_name_")) indexes.add(key.replace("line_product_name_", ""));
  }
  return Array.from(indexes).sort((a, b) => Number(a) - Number(b));
}

function collectLines(formData: FormData): ReceiveLineInput[] {
  const lines: ReceiveLineInput[] = [];
  const indexes = collectLineIndexes(formData);

  for (const idx of indexes) {
    const productId = String(formData.get(`line_product_id_${idx}`) ?? "").trim() || null;
    const code = String(formData.get(`line_product_code_${idx}`) ?? "").trim() || null;
    const name = String(formData.get(`line_product_name_${idx}`) ?? "").trim() || null;
    const soldQty = clamp4(parseNumber(formData.get(`line_sold_qty_${idx}`), 0));
    const owedQty = clamp4(parseNumber(formData.get(`line_owed_qty_${idx}`), 0));
    const expectedQty = clamp4(parseNumber(formData.get(`line_expected_qty_${idx}`), owedQty));
    const receivedQty = clamp4(parseNumber(formData.get(`line_received_qty_${idx}`), 0));
    const osQty = clamp4(parseNumber(formData.get(`line_os_qty_${idx}`), expectedQty - receivedQty));

    const hasData = productId || name || owedQty > 0 || expectedQty > 0 || receivedQty > 0;
    if (!hasData) continue;

    lines.push({
      row_no: Number(idx) || 0,
      product_id: productId,
      product_code_snapshot: code,
      product_name_snapshot: name,
      sold_qty: soldQty,
      owed_qty: owedQty,
      expected_qty: expectedQty,
      received_qty: receivedQty,
      os_qty: osQty,
    });
  }

  return lines;
}

function aggregateProductQty(lines: Array<{ product_id: string | null; received_qty?: number | null }>) {
  const out = new Map<string, number>();
  for (const line of lines) {
    if (!line.product_id) continue;
    const qty = clamp4(Number(line.received_qty ?? 0));
    if (!qty) continue;
    out.set(String(line.product_id), clamp4((out.get(String(line.product_id)) ?? 0) + qty));
  }
  return out;
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
  deltaByProduct: Map<string, number>
) {
  for (const [productId, deltaQty] of deltaByProduct.entries()) {
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

async function generateReceiveNo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  datePrefix: string
) {
  const prefix = `ERS-${datePrefix}-`;
  const { data } = await supabase
    .from("empties_receives")
    .select("receive_no")
    .eq("organization_id", orgId)
    .ilike("receive_no", `${prefix}%`)
    .order("receive_no", { ascending: false })
    .limit(1);
  const latest = data?.[0]?.receive_no ?? "";
  const latestSuffix = latest.startsWith(prefix) ? latest.slice(prefix.length) : "";
  const seq = Number(latestSuffix) || 0;
  return `${prefix}${String(seq + 1).padStart(3, "0")}`;
}

export async function getSuggestedReceiveNo(datePrefix: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };
  const normalized = String(datePrefix ?? "").slice(0, 10);
  if (!normalized) return { error: "Receive date is required." };
  const receiveNo = await generateReceiveNo(supabase, orgId, normalized);
  return { ok: true, receiveNo };
}

export async function getCustomerEmptiesSnapshot(
  customerId: string,
  receiveDate: string,
  showAllTypes = false,
  excludeReceiveId?: string
) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const customer = String(customerId ?? "").trim();
  if (!customer) return { error: "Customer is required." };
  const dateCutoff = String(receiveDate ?? "").slice(0, 10);
  if (!dateCutoff) return { error: "Receive date is required." };

  // 1. Empties products (rows for the table) — items with "empties" in the name
  const { data: emptiesProducts, error: productErr } = await supabase
    .from("products")
    .select("id, code, name, empties_type")
    .eq("organization_id", orgId)
    .ilike("name", "%empties%")
    .order("name");
  if (productErr) return { error: productErr.message };

  type EmptiesProduct = { id: string | number; code?: string | null; name: string; empties_type?: string | null };
  const emptiesProductRows = (emptiesProducts ?? []) as EmptiesProduct[];
  const emptiesProductByType = new Map<string, EmptiesProduct>();
  const emptiesProductIds = new Set<string>();
  for (const p of emptiesProductRows) {
    const et = String(p.empties_type ?? "").trim().toLowerCase();
    emptiesProductIds.add(String(p.id));
    if (et) emptiesProductByType.set(et, p);
  }

  // 2. All relevant products — returnables + empties — build lookup
  const { data: allRelevant, error: relErr } = await supabase
    .from("products")
    .select("id, name, empties_type, returnable")
    .eq("organization_id", orgId)
    .or("returnable.eq.true,name.ilike.%empties%");
  if (relErr) return { error: relErr.message };

  type ProductLookupRow = { id: string | number; name: string; empties_type?: string | null; returnable?: boolean | null };
  const productLookup = new Map<string, { empties_type: string; isReturnable: boolean; isEmpties: boolean }>();
  for (const p of (allRelevant ?? []) as ProductLookupRow[]) {
    const et = String(p.empties_type ?? "").trim().toLowerCase();
    if (!et) continue;
    productLookup.set(String(p.id), {
      empties_type: et,
      isReturnable: Boolean(p.returnable),
      isEmpties: String(p.name ?? "").toLowerCase().includes("empties"),
    });
  }

  // 3. Sales invoice lines for this customer (with invoice_date)
  const salesRes = await supabase
    .from("sales_invoice_lines")
    .select("product_id, cl_qty, sales_invoices!inner(customer_id, invoice_date)")
    .eq("organization_id", orgId)
    .eq("sales_invoices.customer_id", customer);
  if (salesRes.error) return { error: salesRes.error.message };

  const histReturnable = new Map<string, number>();
  const histEmpties = new Map<string, number>();
  const todayExpected = new Map<string, number>();
  const todaySold = new Map<string, number>();

  type SalesLineRow = {
    product_id?: string | null;
    cl_qty?: number | null;
    sales_invoices?: { invoice_date?: string | null } | null;
  };
  for (const row of (salesRes.data ?? []) as SalesLineRow[]) {
    const pid = String(row.product_id ?? "");
    if (!pid) continue;
    const info = productLookup.get(pid);
    if (!info) continue;
    const et = info.empties_type;
    const qty = clamp4(Number(row.cl_qty ?? 0));
    if (!qty) continue;
    const invoiceDate = String(
      (row.sales_invoices as { invoice_date?: string | null } | null)?.invoice_date ?? ""
    ).slice(0, 10);

    if (invoiceDate < dateCutoff) {
      if (info.isReturnable && !info.isEmpties) {
        histReturnable.set(et, clamp4((histReturnable.get(et) ?? 0) + qty));
      } else if (info.isEmpties) {
        histEmpties.set(et, clamp4((histEmpties.get(et) ?? 0) + qty));
      }
    } else if (invoiceDate === dateCutoff) {
      if (info.isReturnable && !info.isEmpties) {
        todayExpected.set(et, clamp4((todayExpected.get(et) ?? 0) + qty));
      } else if (info.isEmpties) {
        todaySold.set(et, clamp4((todaySold.get(et) ?? 0) + qty));
      }
    }
  }

  // 4. Previous empties receives (receive_date < dateCutoff)
  const histReceived = new Map<string, number>();
  const headersRes = await supabase
    .from("empties_receives")
    .select("id")
    .eq("organization_id", orgId)
    .eq("customer_id", customer)
    .lt("receive_date", dateCutoff);
  if (headersRes.error && !headersRes.error.message.toLowerCase().includes("does not exist")) {
    return { error: headersRes.error.message };
  }
  let receiveIds = (headersRes.data ?? []).map((x: { id: string }) => x.id);
  if (excludeReceiveId) receiveIds = receiveIds.filter((id) => id !== excludeReceiveId);

  if (receiveIds.length > 0) {
    const receiveLinesRes = await supabase
      .from("empties_receive_lines")
      .select("product_id, received_qty")
      .eq("organization_id", orgId)
      .in("empties_receive_id", receiveIds);
    if (receiveLinesRes.error && !receiveLinesRes.error.message.toLowerCase().includes("does not exist")) {
      return { error: receiveLinesRes.error.message };
    }
    for (const row of (receiveLinesRes.data ?? []) as Array<{ product_id?: string | null; received_qty?: number | null }>) {
      const pid = String(row.product_id ?? "");
      if (!pid) continue;
      const info = productLookup.get(pid);
      const et = info?.empties_type ?? "";
      if (!et) continue;
      const qty = clamp4(Number(row.received_qty ?? 0));
      if (!qty) continue;
      histReceived.set(et, clamp4((histReceived.get(et) ?? 0) + qty));
    }
  }

  // 5. Build rows — one per empties product
  const rows: SnapshotRow[] = [];
  for (const ep of emptiesProductRows) {
    const et = String(ep.empties_type ?? "").trim().toLowerCase();
    if (!et) continue;
    const owed = clamp4((histReturnable.get(et) ?? 0) - (histEmpties.get(et) ?? 0) - (histReceived.get(et) ?? 0));
    const expected = todayExpected.get(et) ?? 0;
    const sold = todaySold.get(et) ?? 0;
    const os = clamp4(owed + expected - sold);
    if (!showAllTypes && owed === 0 && expected === 0 && sold === 0) continue;
    rows.push({
      product_id: String(ep.id),
      product_code: String(ep.code ?? ""),
      product_name: ep.name,
      sold_qty: sold,
      owed_qty: owed,
      expected_qty: expected,
      received_qty: 0,
      os_qty: os,
    });
  }

  return { ok: true, rows };
}

export async function saveEmptiesReceive(formData: FormData) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(formData.get("id") ?? "").trim() || null;
  const receiveNoInput = String(formData.get("receive_no") ?? "").trim() || null;
  const emptiesReceiptNo = String(formData.get("empties_receipt_no") ?? "").trim() || null;
  const customerId = String(formData.get("customer_id") ?? "").trim() || null;
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const receiveDate = String(formData.get("receive_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!customerId) return { error: "Customer is required." };
  if (!locationId) return { error: "Location is required." };
  if (!receiveDate) return { error: "Receive date is required." };

  const lines = collectLines(formData);
  const activeLines = lines.filter((l) => l.received_qty > 0);
  if (activeLines.length === 0) return { error: "Enter received quantity for at least one line." };
  if (activeLines.some((line) => !line.product_id)) return { error: "Each line must have a valid product." };

  const totalItems = activeLines.length;
  const totalReceivedQty = clamp4(activeLines.reduce((sum, line) => sum + line.received_qty, 0));
  const totalOsQty = clamp4(activeLines.reduce((sum, line) => sum + line.os_qty, 0));

  let receiveId = id;
  let receiveNo = receiveNoInput;
  let previousLines: Array<{ product_id: string | null; received_qty?: number | null }> = [];

  if (receiveId) {
    const { data: existing } = await supabase
      .from("empties_receives")
      .select("id, receive_no")
      .eq("organization_id", orgId)
      .eq("id", receiveId)
      .single();
    if (!existing) return { error: "Empties receive not found." };
    receiveNo = receiveNo || existing.receive_no;

    const prevRes = await supabase
      .from("empties_receive_lines")
      .select("product_id, received_qty")
      .eq("organization_id", orgId)
      .eq("empties_receive_id", receiveId);
    if (prevRes.error) return { error: prevRes.error.message };
    previousLines = prevRes.data ?? [];

    const { error: updateError } = await supabase
      .from("empties_receives")
      .update({
        receive_no: receiveNo,
        empties_receipt_no: emptiesReceiptNo,
        customer_id: customerId,
        location_id: locationId,
        receive_date: receiveDate,
        notes,
        total_items: totalItems,
        total_received_qty: totalReceivedQty,
        total_os_qty: totalOsQty,
        status: "saved",
      })
      .eq("organization_id", orgId)
      .eq("id", receiveId);
    if (updateError) return { error: updateError.message };
  } else {
    if (!receiveNo) receiveNo = await generateReceiveNo(supabase, orgId, receiveDate.slice(0, 10));

    const { data: inserted, error: insertError } = await supabase
      .from("empties_receives")
      .insert({
        organization_id: orgId,
        receive_no: receiveNo,
        empties_receipt_no: emptiesReceiptNo,
        customer_id: customerId,
        location_id: locationId,
        receive_date: receiveDate,
        notes,
        total_items: totalItems,
        total_received_qty: totalReceivedQty,
        total_os_qty: totalOsQty,
        status: "saved",
      })
      .select("id")
      .single();
    if (insertError) return { error: insertError.message };
    receiveId = inserted?.id ?? null;
    if (!receiveId) return { error: "Failed to create empties receive." };
  }

  const { error: clearError } = await supabase
    .from("empties_receive_lines")
    .delete()
    .eq("organization_id", orgId)
    .eq("empties_receive_id", receiveId);
  if (clearError) return { error: clearError.message };

  const rows = activeLines.map((line) => ({
    organization_id: orgId,
    empties_receive_id: receiveId!,
    product_id: line.product_id,
    product_code_snapshot: line.product_code_snapshot,
    product_name_snapshot: line.product_name_snapshot,
    sold_qty: line.sold_qty,
    owed_qty: line.owed_qty,
    expected_qty: line.expected_qty,
    received_qty: line.received_qty,
    os_qty: line.os_qty,
    row_no: line.row_no,
  }));
  const { error: insertLinesError } = await supabase.from("empties_receive_lines").insert(rows);
  if (insertLinesError) return { error: insertLinesError.message };

  const prevStock = aggregateProductQty(previousLines);
  const nextStock = aggregateProductQty(activeLines);
  const stockDelta = subtractMaps(nextStock, prevStock);
  const stockResult = await applyStockDelta(supabase, orgId, stockDelta);
  if ("error" in stockResult && stockResult.error) return { error: stockResult.error };

  revalidatePath("/dashboard/sales/empties-receive");
  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/inventory/stocks-by-location");
  return { ok: true, id: receiveId };
}

export async function deleteEmptiesReceive(id: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const receiveId = String(id ?? "").trim();
  if (!receiveId) return { error: "Missing receive id." };

  const { data: existing } = await supabase
    .from("empties_receives")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", receiveId)
    .single();
  if (!existing) return { error: "Empties receive not found." };

  const prevRes = await supabase
    .from("empties_receive_lines")
    .select("product_id, received_qty")
    .eq("organization_id", orgId)
    .eq("empties_receive_id", receiveId);
  if (prevRes.error) return { error: prevRes.error.message };
  const previousLines = prevRes.data ?? [];

  const { error: lineDeleteError } = await supabase
    .from("empties_receive_lines")
    .delete()
    .eq("organization_id", orgId)
    .eq("empties_receive_id", receiveId);
  if (lineDeleteError) return { error: lineDeleteError.message };

  const { error: deleteError } = await supabase
    .from("empties_receives")
    .delete()
    .eq("organization_id", orgId)
    .eq("id", receiveId);
  if (deleteError) return { error: deleteError.message };

  const reverseDelta = new Map<string, number>();
  for (const [productId, qty] of aggregateProductQty(previousLines).entries()) {
    reverseDelta.set(productId, clamp4(-qty));
  }
  const stockResult = await applyStockDelta(supabase, orgId, reverseDelta);
  if ("error" in stockResult && stockResult.error) return { error: stockResult.error };

  revalidatePath("/dashboard/sales/empties-receive");
  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/inventory/stocks-by-location");
  return { ok: true };
}
