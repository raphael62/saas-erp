"use server";

import { createClient } from "@/lib/supabase/server";
import { isTableUnavailableError, isSchemaCacheError } from "@/lib/supabase/table-missing";

const SCHEMA_CACHE_MSG =
  "PostgREST schema cache is out of sync. Click 'Reload schema' then try again.";

type SummaryRow = {
  customer_id: string;
  phone: string;
  pic_name: string;
  cust_code: string;
  customer_name: string;
  opening_balance: number;
  expected: number;
  sold_out: number;
  received: number;
  balance: number;
  details: DetailRow[];
};

type DetailRow = {
  empties_type: string;
  opening_balance: number;
  expected: number;
  sold_out: number;
  received: number;
  balance: number;
};

type CustomerRow = {
  id: string;
  name?: string | null;
  phone?: string | null;
  contact_person?: string | null;
  tax_id?: string | null;
};

type ProductInfo = {
  emptiesType: string;
  isReturnable: boolean;
  isEmpties: boolean;
};

type EmptiesTransactionRow = {
  id: string;
  tx_type: "invoice" | "receive";
  tx_date: string;
  reference: string;
  description: string;
  expected: number;
  sold_out: number;
  received: number;
  balance: number;
  edit_path: string;
};

function clamp4(value: number) {
  return Number(value.toFixed(4));
}

function normalizeDate(input: string | null | undefined) {
  return String(input ?? "").slice(0, 10);
}

function addQty(
  map: Map<string, Map<string, number>>,
  customerId: string,
  emptiesType: string,
  qty: number
) {
  const byType = map.get(customerId) ?? new Map<string, number>();
  byType.set(emptiesType, clamp4((byType.get(emptiesType) ?? 0) + qty));
  map.set(customerId, byType);
}

function getQty(map: Map<string, Map<string, number>>, customerId: string, emptiesType: string) {
  return map.get(customerId)?.get(emptiesType) ?? 0;
}

async function getOrgContext() {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { supabase: ctx.supabase, orgId: null as string | null, error: ctx.error };
  return { supabase: ctx.supabase, orgId: ctx.orgId, error: null as string | null };
}

export async function getCustomerEmptiesStatement(fromDateInput: string, toDateInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const fromDate = normalizeDate(fromDateInput);
  const toDate = normalizeDate(toDateInput);
  if (!fromDate || !toDate) return { error: "Date From and Date To are required." };
  if (fromDate > toDate) return { error: "Date From cannot be after Date To." };

  const customersRes = await supabase
    .from("customers")
    .select("id, name, phone, contact_person, tax_id")
    .eq("organization_id", orgId)
    .order("name");
  if (customersRes.error)
    return { error: isSchemaCacheError(customersRes.error) ? SCHEMA_CACHE_MSG : customersRes.error.message };

  const productsRes = await supabase
    .from("products")
    .select("id, name, empties_type, returnable")
    .eq("organization_id", orgId)
    .or("returnable.eq.true,name.ilike.%empties%");
  if (productsRes.error)
    return { error: isSchemaCacheError(productsRes.error) ? SCHEMA_CACHE_MSG : productsRes.error.message };

  const productInfoById = new Map<string, ProductInfo>();
  const displayNameByKey = new Map<string, string>();
  for (const row of (productsRes.data ?? []) as Array<{
    id: string | number;
    name?: string | null;
    empties_type?: string | null;
    returnable?: boolean | null;
  }>) {
    const rawType = String(row.empties_type ?? "").trim();
    const key = rawType.toLowerCase();
    if (!key) continue;
    if (!displayNameByKey.has(key)) displayNameByKey.set(key, rawType);
    productInfoById.set(String(row.id), {
      emptiesType: key,
      isReturnable: Boolean(row.returnable),
      isEmpties: String(row.name ?? "").toLowerCase().includes("empties"),
    });
  }

  const openingByCustomerType = new Map<string, Map<string, number>>();
  const expectedByCustomerType = new Map<string, Map<string, number>>();
  const soldByCustomerType = new Map<string, Map<string, number>>();
  const receivedByCustomerType = new Map<string, Map<string, number>>();

  const salesRes = await supabase
    .from("sales_invoice_lines")
    .select("product_id, cl_qty, sales_invoices!inner(customer_id, invoice_date)")
    .eq("organization_id", orgId)
    .lte("sales_invoices.invoice_date", toDate);
  if (salesRes.error)
    return { error: isSchemaCacheError(salesRes.error) ? SCHEMA_CACHE_MSG : salesRes.error.message };

  for (const row of (salesRes.data ?? []) as Array<{
    product_id?: string | null;
    cl_qty?: number | null;
    sales_invoices?: { customer_id?: string | null; invoice_date?: string | null } | null;
  }>) {
    const productId = String(row.product_id ?? "");
    const info = productInfoById.get(productId);
    if (!productId || !info) continue;

    const customerId = String((row.sales_invoices?.customer_id ?? "")).trim();
    if (!customerId) continue;

    const invoiceDate = normalizeDate(row.sales_invoices?.invoice_date);
    if (!invoiceDate || invoiceDate > toDate) continue;

    const qty = clamp4(Number(row.cl_qty ?? 0));
    if (!qty) continue;

    if (invoiceDate < fromDate) {
      if (info.isReturnable && !info.isEmpties) {
        addQty(openingByCustomerType, customerId, info.emptiesType, qty);
      } else if (info.isEmpties) {
        addQty(openingByCustomerType, customerId, info.emptiesType, -qty);
      }
    } else if (invoiceDate >= fromDate && invoiceDate <= toDate) {
      if (info.isReturnable && !info.isEmpties) {
        addQty(expectedByCustomerType, customerId, info.emptiesType, qty);
      } else if (info.isEmpties) {
        addQty(soldByCustomerType, customerId, info.emptiesType, qty);
      }
    }
  }

  const receivesRes = await supabase
    .from("empties_receive_lines")
    .select("product_id, received_qty, empties_receives!inner(customer_id, receive_date)")
    .eq("organization_id", orgId)
    .lte("empties_receives.receive_date", toDate);
  if (receivesRes.error && !isTableUnavailableError(receivesRes.error)) {
    return { error: isSchemaCacheError(receivesRes.error) ? SCHEMA_CACHE_MSG : receivesRes.error.message };
  }

  for (const row of (receivesRes.data ?? []) as Array<{
    product_id?: string | null;
    received_qty?: number | null;
    empties_receives?: { customer_id?: string | null; receive_date?: string | null } | null;
  }>) {
    const productId = String(row.product_id ?? "");
    const info = productInfoById.get(productId);
    if (!productId || !info) continue;

    const customerId = String((row.empties_receives?.customer_id ?? "")).trim();
    if (!customerId) continue;

    const receiveDate = normalizeDate(row.empties_receives?.receive_date);
    if (!receiveDate || receiveDate > toDate) continue;

    const qty = clamp4(Number(row.received_qty ?? 0));
    if (!qty) continue;

    if (receiveDate < fromDate) {
      addQty(openingByCustomerType, customerId, info.emptiesType, -qty);
    } else if (receiveDate >= fromDate && receiveDate <= toDate) {
      addQty(receivedByCustomerType, customerId, info.emptiesType, qty);
    }
  }

  const customers = (customersRes.data ?? []) as CustomerRow[];
  const rows: SummaryRow[] = [];
  for (const customer of customers) {
    const customerId = String(customer.id);
    const typeSet = new Set<string>([
      ...(openingByCustomerType.get(customerId)?.keys() ?? []),
      ...(expectedByCustomerType.get(customerId)?.keys() ?? []),
      ...(soldByCustomerType.get(customerId)?.keys() ?? []),
      ...(receivedByCustomerType.get(customerId)?.keys() ?? []),
    ]);
    if (typeSet.size === 0) continue;

    const details: DetailRow[] = [];
    let openingBalance = 0;
    let expected = 0;
    let soldOut = 0;
    let received = 0;
    let balance = 0;

    for (const emptiesType of Array.from(typeSet).sort((a, b) => a.localeCompare(b))) {
      const opening = getQty(openingByCustomerType, customerId, emptiesType);
      const expectedQty = getQty(expectedByCustomerType, customerId, emptiesType);
      const soldQty = getQty(soldByCustomerType, customerId, emptiesType);
      const receivedQty = getQty(receivedByCustomerType, customerId, emptiesType);
      const bal = clamp4(opening + expectedQty - soldQty - receivedQty);

      details.push({
        empties_type: displayNameByKey.get(emptiesType) ?? emptiesType,
        opening_balance: opening,
        expected: expectedQty,
        sold_out: soldQty,
        received: receivedQty,
        balance: bal,
      });

      openingBalance = clamp4(openingBalance + opening);
      expected = clamp4(expected + expectedQty);
      soldOut = clamp4(soldOut + soldQty);
      received = clamp4(received + receivedQty);
      balance = clamp4(balance + bal);
    }

    rows.push({
      customer_id: customerId,
      phone: String(customer.phone ?? ""),
      pic_name: String(customer.contact_person ?? ""),
      cust_code: String(customer.tax_id ?? ""),
      customer_name: String(customer.name ?? ""),
      opening_balance: openingBalance,
      expected,
      sold_out: soldOut,
      received,
      balance,
      details,
    });
  }

  rows.sort((a, b) => a.customer_name.localeCompare(b.customer_name, undefined, { sensitivity: "base" }));
  return { ok: true, fromDate, toDate, rows };
}

export async function getCustomerEmptiesTypeTransactions(
  customerIdInput: string,
  emptiesTypeInput: string,
  fromDateInput: string,
  toDateInput: string
) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const customerId = String(customerIdInput ?? "").trim();
  const emptiesType = String(emptiesTypeInput ?? "").trim();
  const fromDate = normalizeDate(fromDateInput);
  const toDate = normalizeDate(toDateInput);
  if (!customerId) return { error: "Customer is required." };
  if (!emptiesType) return { error: "Empties type is required." };
  if (!fromDate || !toDate) return { error: "Date From and Date To are required." };
  if (fromDate > toDate) return { error: "Date From cannot be after Date To." };

  const productsRes = await supabase
    .from("products")
    .select("id, name, empties_type, returnable")
    .eq("organization_id", orgId)
    .ilike("empties_type", emptiesType);
  if (productsRes.error)
    return { error: isSchemaCacheError(productsRes.error) ? SCHEMA_CACHE_MSG : productsRes.error.message };

  const productInfoById = new Map<string, ProductInfo>();
  for (const row of (productsRes.data ?? []) as Array<{
    id: string | number;
    name?: string | null;
    empties_type?: string | null;
    returnable?: boolean | null;
  }>) {
    const et = String(row.empties_type ?? "").trim().toLowerCase();
    if (!et) continue;
    productInfoById.set(String(row.id), {
      emptiesType: et,
      isReturnable: Boolean(row.returnable),
      isEmpties: String(row.name ?? "").toLowerCase().includes("empties"),
    });
  }
  const productIds = Array.from(productInfoById.keys());
  if (productIds.length === 0) return { ok: true, opening: 0, rows: [] as EmptiesTransactionRow[] };

  // --- Compute opening balance (all activity before fromDate) ---
  let opening = 0;

  const preSalesRes = await supabase
    .from("sales_invoice_lines")
    .select("product_id, cl_qty, sales_invoices!inner(customer_id, invoice_date)")
    .eq("organization_id", orgId)
    .eq("sales_invoices.customer_id", customerId)
    .lt("sales_invoices.invoice_date", fromDate)
    .in("product_id", productIds);
  if (!preSalesRes.error) {
    for (const row of (preSalesRes.data ?? []) as Array<{ product_id?: string | null; cl_qty?: number | null }>) {
      const info = productInfoById.get(String(row.product_id ?? ""));
      if (!info) continue;
      const qty = clamp4(Number(row.cl_qty ?? 0));
      if (!qty) continue;
      if (info.isReturnable && !info.isEmpties) opening = clamp4(opening + qty);
      else if (info.isEmpties) opening = clamp4(opening - qty);
    }
  }

  const preReceiveRes = await supabase
    .from("empties_receive_lines")
    .select("product_id, received_qty, empties_receives!inner(customer_id, receive_date)")
    .eq("organization_id", orgId)
    .eq("empties_receives.customer_id", customerId)
    .lt("empties_receives.receive_date", fromDate)
    .in("product_id", productIds);
  if (!preReceiveRes.error) {
    for (const row of (preReceiveRes.data ?? []) as Array<{ product_id?: string | null; received_qty?: number | null }>) {
      if (!productInfoById.has(String(row.product_id ?? ""))) continue;
      const qty = clamp4(Number(row.received_qty ?? 0));
      if (qty) opening = clamp4(opening - qty);
    }
  }

  // --- Collect in-period transactions ---
  type RawTx = {
    id: string;
    tx_type: "invoice" | "receive";
    tx_date: string;
    reference: string;
    description: string;
    expected: number;
    sold_out: number;
    received: number;
    edit_path: string;
  };
  const invoiceAgg = new Map<
    string,
    {
      id: string;
      tx_type: "invoice";
      tx_date: string;
      reference: string;
      expected: number;
      sold_out: number;
      edit_path: string;
    }
  >();
  const receiveAgg = new Map<
    string,
    {
      id: string;
      tx_type: "receive";
      tx_date: string;
      reference: string;
      received: number;
      edit_path: string;
    }
  >();

  const salesRes = await supabase
    .from("sales_invoice_lines")
    .select(
      "sales_invoice_id, product_id, item_name_snapshot, cl_qty, sales_invoices!inner(id, invoice_no, customer_id, invoice_date)"
    )
    .eq("organization_id", orgId)
    .eq("sales_invoices.customer_id", customerId)
    .gte("sales_invoices.invoice_date", fromDate)
    .lte("sales_invoices.invoice_date", toDate)
    .in("product_id", productIds);
  if (salesRes.error)
    return { error: isSchemaCacheError(salesRes.error) ? SCHEMA_CACHE_MSG : salesRes.error.message };

  for (const row of (salesRes.data ?? []) as Array<{
    sales_invoice_id?: string | null;
    product_id?: string | null;
    item_name_snapshot?: string | null;
    cl_qty?: number | null;
    sales_invoices?: { id?: string | null; invoice_no?: string | null; invoice_date?: string | null } | null;
  }>) {
    const productId = String(row.product_id ?? "");
    const info = productInfoById.get(productId);
    if (!info) continue;
    const invoiceId = String((row.sales_invoices?.id ?? row.sales_invoice_id ?? "")).trim();
    const invoiceNo = String(row.sales_invoices?.invoice_no ?? "").trim();
    const invoiceDate = normalizeDate(row.sales_invoices?.invoice_date);
    if (!invoiceId || !invoiceDate) continue;
    const qty = clamp4(Number(row.cl_qty ?? 0));
    if (!qty) continue;

    const existing = invoiceAgg.get(invoiceId) ?? {
      id: `inv-${invoiceId}`,
      tx_type: "invoice" as const,
      tx_date: invoiceDate,
      reference: invoiceNo || invoiceId,
      expected: 0,
      sold_out: 0,
      edit_path: `/dashboard/sales/sales-invoices?edit=${encodeURIComponent(invoiceId)}`,
    };
    if (info.isEmpties) existing.sold_out = clamp4(existing.sold_out + qty);
    else existing.expected = clamp4(existing.expected + qty);
    invoiceAgg.set(invoiceId, existing);
  }

  const receiveRes = await supabase
    .from("empties_receive_lines")
    .select(
      "empties_receive_id, product_id, product_name_snapshot, received_qty, empties_receives!inner(id, receive_no, customer_id, receive_date)"
    )
    .eq("organization_id", orgId)
    .eq("empties_receives.customer_id", customerId)
    .gte("empties_receives.receive_date", fromDate)
    .lte("empties_receives.receive_date", toDate)
    .in("product_id", productIds);
  if (receiveRes.error && !isTableUnavailableError(receiveRes.error)) {
    return { error: isSchemaCacheError(receiveRes.error) ? SCHEMA_CACHE_MSG : receiveRes.error.message };
  }

  for (const row of (receiveRes.data ?? []) as Array<{
    empties_receive_id?: string | null;
    product_id?: string | null;
    product_name_snapshot?: string | null;
    received_qty?: number | null;
    empties_receives?: { id?: string | null; receive_no?: string | null; receive_date?: string | null } | null;
  }>) {
    const productId = String(row.product_id ?? "");
    if (!productInfoById.has(productId)) continue;
    const receiveId = String((row.empties_receives?.id ?? row.empties_receive_id ?? "")).trim();
    const receiveNo = String(row.empties_receives?.receive_no ?? "").trim();
    const receiveDate = normalizeDate(row.empties_receives?.receive_date);
    if (!receiveId || !receiveDate) continue;
    const qty = clamp4(Number(row.received_qty ?? 0));
    if (!qty) continue;

    const existing = receiveAgg.get(receiveId) ?? {
      id: `rec-${receiveId}`,
      tx_type: "receive" as const,
      tx_date: receiveDate,
      reference: receiveNo || receiveId,
      received: 0,
      edit_path: `/dashboard/sales/empties-receive?edit=${encodeURIComponent(receiveId)}`,
    };
    existing.received = clamp4(existing.received + qty);
    receiveAgg.set(receiveId, existing);
  }

  const rawRows: RawTx[] = [
    ...Array.from(invoiceAgg.values()).map((inv) => ({
      id: inv.id,
      tx_type: "invoice" as const,
      tx_date: inv.tx_date,
      reference: inv.reference,
      description:
        inv.expected > 0 && inv.sold_out > 0
          ? "Sales Invoice (Expected + Sold Out)"
          : inv.sold_out > 0
            ? "Sales Invoice (Sold Out)"
            : "Sales Invoice (Expected)",
      expected: inv.expected,
      sold_out: inv.sold_out,
      received: 0,
      edit_path: inv.edit_path,
    })),
    ...Array.from(receiveAgg.values()).map((rec) => ({
      id: rec.id,
      tx_type: "receive" as const,
      tx_date: rec.tx_date,
      reference: rec.reference,
      description: "Empties Receive",
      expected: 0,
      sold_out: 0,
      received: rec.received,
      edit_path: rec.edit_path,
    })),
  ];

  rawRows.sort((a, b) => {
    const d = a.tx_date.localeCompare(b.tx_date);
    if (d !== 0) return d;
    return a.reference.localeCompare(b.reference, undefined, { numeric: true, sensitivity: "base" });
  });

  // Build running balance
  let runningBalance = opening;
  const txRows: EmptiesTransactionRow[] = rawRows.map((r) => {
    runningBalance = clamp4(runningBalance + r.expected - r.sold_out - r.received);
    return { ...r, balance: runningBalance };
  });

  return { ok: true, opening, rows: txRows };
}
