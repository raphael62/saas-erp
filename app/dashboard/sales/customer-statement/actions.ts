"use server";

import { createClient } from "@/lib/supabase/server";
import { isTableUnavailableError, isSchemaCacheError } from "@/lib/supabase/table-missing";

const SCHEMA_CACHE_MSG =
  "PostgREST schema cache is out of sync. Click 'Reload schema' then try again.";

type CustomerRow = {
  id: string;
  name?: string | null;
  phone?: string | null;
  contact_person?: string | null;
  tax_id?: string | null;
};

type StatementRow = {
  customer_id: string;
  phone: string;
  pic_name: string;
  cust_code: string;
  customer_name: string;
  opening_balance: number;
  sales_value: number;
  payment: number;
  outstanding: number;
  balance: number;
};

type TxRow = {
  id: string;
  tx_type: "invoice" | "payment";
  tx_date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  edit_path: string;
};

function clamp2(value: number) {
  return Number(value.toFixed(2));
}

function normalizeDate(input: string | null | undefined) {
  return String(input ?? "").slice(0, 10);
}

async function getOrgContext() {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { supabase: ctx.supabase, orgId: null as string | null, error: ctx.error };
  return { supabase: ctx.supabase, orgId: ctx.orgId, error: null as string | null };
}

export async function getCustomerStatement(fromDateInput: string, toDateInput: string) {
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

  const salesRes = await supabase
    .from("sales_invoices")
    .select("id, customer_id, invoice_date, invoice_no, grand_total")
    .eq("organization_id", orgId)
    .lte("invoice_date", toDate);
  if (salesRes.error)
    return { error: isSchemaCacheError(salesRes.error) ? SCHEMA_CACHE_MSG : salesRes.error.message };

  const paymentsRes = await supabase
    .from("customer_payments")
    .select("id, customer_id, payment_date, payment_no, amount")
    .eq("organization_id", orgId)
    .lte("payment_date", toDate);
  const paymentsMissing = Boolean(paymentsRes.error && isTableUnavailableError(paymentsRes.error));
  if (paymentsRes.error && !paymentsMissing)
    return { error: isSchemaCacheError(paymentsRes.error) ? SCHEMA_CACHE_MSG : paymentsRes.error.message };

  const openingByCustomer = new Map<string, number>();
  const salesByCustomer = new Map<string, number>();
  const paymentByCustomer = new Map<string, number>();

  for (const row of (salesRes.data ?? []) as Array<{
    customer_id?: string | null;
    invoice_date?: string | null;
    grand_total?: number | null;
  }>) {
    const customerId = String(row.customer_id ?? "").trim();
    const date = normalizeDate(row.invoice_date);
    if (!customerId || !date) continue;
    const amount = clamp2(Number(row.grand_total ?? 0));
    if (!amount) continue;

    if (date < fromDate) {
      openingByCustomer.set(customerId, clamp2((openingByCustomer.get(customerId) ?? 0) + amount));
    } else {
      salesByCustomer.set(customerId, clamp2((salesByCustomer.get(customerId) ?? 0) + amount));
    }
  }

  if (!paymentsMissing) {
    for (const row of (paymentsRes.data ?? []) as Array<{
      customer_id?: string | null;
      payment_date?: string | null;
      amount?: number | null;
    }>) {
      const customerId = String(row.customer_id ?? "").trim();
      const date = normalizeDate(row.payment_date);
      if (!customerId || !date) continue;
      const amount = clamp2(Number(row.amount ?? 0));
      if (!amount) continue;

      if (date < fromDate) {
        openingByCustomer.set(customerId, clamp2((openingByCustomer.get(customerId) ?? 0) - amount));
      } else {
        paymentByCustomer.set(customerId, clamp2((paymentByCustomer.get(customerId) ?? 0) + amount));
      }
    }
  }

  const rows: StatementRow[] = [];
  for (const customer of (customersRes.data ?? []) as CustomerRow[]) {
    const customerId = String(customer.id);
    const opening = clamp2(openingByCustomer.get(customerId) ?? 0);
    const sales = clamp2(salesByCustomer.get(customerId) ?? 0);
    const payment = clamp2(paymentByCustomer.get(customerId) ?? 0);
    const outstanding = clamp2(opening + sales - payment);
    const balance = outstanding;
    if (!opening && !sales && !payment && !outstanding) continue;

    rows.push({
      customer_id: customerId,
      phone: String(customer.phone ?? ""),
      pic_name: String(customer.contact_person ?? ""),
      cust_code: String(customer.tax_id ?? ""),
      customer_name: String(customer.name ?? ""),
      opening_balance: opening,
      sales_value: sales,
      payment,
      outstanding,
      balance,
    });
  }

  rows.sort((a, b) => a.customer_name.localeCompare(b.customer_name, undefined, { sensitivity: "base" }));
  return { ok: true, fromDate, toDate, rows, payments_missing: paymentsMissing };
}

export async function getCustomerStatementTransactions(
  customerIdInput: string,
  fromDateInput: string,
  toDateInput: string
) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const customerId = String(customerIdInput ?? "").trim();
  const fromDate = normalizeDate(fromDateInput);
  const toDate = normalizeDate(toDateInput);
  if (!customerId) return { error: "Customer is required." };
  if (!fromDate || !toDate) return { error: "Date From and Date To are required." };
  if (fromDate > toDate) return { error: "Date From cannot be after Date To." };

  const preSalesRes = await supabase
    .from("sales_invoices")
    .select("grand_total")
    .eq("organization_id", orgId)
    .eq("customer_id", customerId)
    .lt("invoice_date", fromDate);
  if (preSalesRes.error)
    return { error: isSchemaCacheError(preSalesRes.error) ? SCHEMA_CACHE_MSG : preSalesRes.error.message };

  const prePaymentsRes = await supabase
    .from("customer_payments")
    .select("amount")
    .eq("organization_id", orgId)
    .eq("customer_id", customerId)
    .lt("payment_date", fromDate);
  const prePaymentsMissing = Boolean(prePaymentsRes.error && isTableUnavailableError(prePaymentsRes.error));
  if (prePaymentsRes.error && !prePaymentsMissing)
    return { error: isSchemaCacheError(prePaymentsRes.error) ? SCHEMA_CACHE_MSG : prePaymentsRes.error.message };

  let opening = 0;
  for (const row of (preSalesRes.data ?? []) as Array<{ grand_total?: number | null }>) {
    opening = clamp2(opening + Number(row.grand_total ?? 0));
  }
  if (!prePaymentsMissing) {
    for (const row of (prePaymentsRes.data ?? []) as Array<{ amount?: number | null }>) {
      opening = clamp2(opening - Number(row.amount ?? 0));
    }
  }

  const salesRes = await supabase
    .from("sales_invoices")
    .select("id, invoice_no, invoice_date, grand_total")
    .eq("organization_id", orgId)
    .eq("customer_id", customerId)
    .gte("invoice_date", fromDate)
    .lte("invoice_date", toDate);
  if (salesRes.error)
    return { error: isSchemaCacheError(salesRes.error) ? SCHEMA_CACHE_MSG : salesRes.error.message };

  const paymentsRes = await supabase
    .from("customer_payments")
    .select("id, payment_no, payment_date, amount, payment_method")
    .eq("organization_id", orgId)
    .eq("customer_id", customerId)
    .gte("payment_date", fromDate)
    .lte("payment_date", toDate);
  const paymentsMissing = Boolean(paymentsRes.error && isTableUnavailableError(paymentsRes.error));
  if (paymentsRes.error && !paymentsMissing)
    return { error: isSchemaCacheError(paymentsRes.error) ? SCHEMA_CACHE_MSG : paymentsRes.error.message };

  const txRaw: Array<Omit<TxRow, "balance">> = [];
  for (const row of (salesRes.data ?? []) as Array<{
    id?: string | null;
    invoice_no?: string | null;
    invoice_date?: string | null;
    grand_total?: number | null;
  }>) {
    const id = String(row.id ?? "").trim();
    const date = normalizeDate(row.invoice_date);
    if (!id || !date) continue;
    txRaw.push({
      id: `inv-${id}`,
      tx_type: "invoice",
      tx_date: date,
      reference: String(row.invoice_no ?? id),
      description: "Sales Invoice",
      debit: clamp2(Number(row.grand_total ?? 0)),
      credit: 0,
      edit_path: `/dashboard/sales/sales-invoices?edit=${encodeURIComponent(id)}`,
    });
  }

  if (!paymentsMissing) {
    for (const row of (paymentsRes.data ?? []) as Array<{
      id?: string | null;
      payment_no?: string | null;
      payment_date?: string | null;
      amount?: number | null;
      payment_method?: string | null;
    }>) {
      const id = String(row.id ?? "").trim();
      const date = normalizeDate(row.payment_date);
      if (!id || !date) continue;
      const method = String(row.payment_method ?? "Payment").trim();
      txRaw.push({
        id: `pay-${id}`,
        tx_type: "payment",
        tx_date: date,
        reference: String(row.payment_no ?? id),
        description: `Payment (${method})`,
        debit: 0,
        credit: clamp2(Number(row.amount ?? 0)),
        edit_path: `/dashboard/sales/customer-payments?edit=${encodeURIComponent(id)}`,
      });
    }
  }

  txRaw.sort((a, b) => {
    const d = a.tx_date.localeCompare(b.tx_date);
    if (d !== 0) return d;
    if (a.tx_type !== b.tx_type) return a.tx_type === "payment" ? -1 : 1;
    return a.reference.localeCompare(b.reference, undefined, { numeric: true, sensitivity: "base" });
  });

  let running = clamp2(opening);
  const rows: TxRow[] = txRaw.map((row) => {
    running = clamp2(running + row.debit - row.credit);
    return {
      ...row,
      balance: running,
    };
  });

  return { ok: true, opening: clamp2(opening), rows, payments_missing: paymentsMissing };
}
