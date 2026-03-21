"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type SavePaymentInput = {
  id?: string;
  customer_id: string;
  payment_date: string;
  bank_date?: string;
  payment_account?: string;
  payment_method?: string;
  amount: number;
  reference?: string;
  notes?: string;
};

type BatchPaymentRowInput = {
  customer_id?: string;
  payment_date?: string;
  bank_date?: string;
  payment_account?: string;
  payment_method?: string;
  amount?: number;
  reference?: string;
  notes?: string;
};

function normalizeDate(input: string | null | undefined) {
  return String(input ?? "").slice(0, 10);
}

function clamp2(value: number) {
  return Number(value.toFixed(2));
}

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

async function generatePaymentNo(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, dateIso: string) {
  const prefix = normalizeDate(dateIso) || new Date().toISOString().slice(0, 10);
  const like = `${prefix}-%`;

  const { data } = await supabase
    .from("customer_payments")
    .select("payment_no")
    .eq("organization_id", orgId)
    .ilike("payment_no", like)
    .order("payment_no", { ascending: false })
    .limit(1);

  const last = String((data?.[0] as { payment_no?: string } | undefined)?.payment_no ?? "");
  const suffix = last.startsWith(prefix) ? Number(last.slice(prefix.length + 1)) || 0 : 0;
  return `${prefix}-${String(suffix + 1).padStart(3, "0")}`;
}

export async function getSuggestedPaymentNo(paymentDateInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const paymentDate = normalizeDate(paymentDateInput);
  if (!paymentDate) return { error: "Transaction Date is required." };

  const payment_no = await generatePaymentNo(supabase, orgId, paymentDate);
  return { ok: true, payment_no };
}

export async function getCustomerOutstanding(customerIdInput: string, asOfDateInput: string, excludePaymentIdInput?: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const customerId = String(customerIdInput ?? "").trim();
  const asOfDate = normalizeDate(asOfDateInput);
  const excludePaymentId = String(excludePaymentIdInput ?? "").trim();
  if (!customerId) return { error: "Customer is required." };
  if (!asOfDate) return { error: "Date is required." };

  const salesRes = await supabase
    .from("sales_invoices")
    .select("grand_total")
    .eq("organization_id", orgId)
    .eq("customer_id", customerId)
    .lte("invoice_date", asOfDate);
  if (salesRes.error) return { error: salesRes.error.message };

  const paymentsRes = await supabase
    .from("customer_payments")
    .select("id, amount")
    .eq("organization_id", orgId)
    .eq("customer_id", customerId)
    .lte("payment_date", asOfDate);
  if (paymentsRes.error && !paymentsRes.error.message.toLowerCase().includes("does not exist")) {
    return { error: paymentsRes.error.message };
  }

  const totalSales = (salesRes.data ?? []).reduce(
    (sum, row) => clamp2(sum + Number((row as { grand_total?: number | null }).grand_total ?? 0)),
    0
  );
  const totalPayments = (paymentsRes.data ?? []).reduce((sum, row) => {
    const r = row as { id?: string | null; amount?: number | null };
    if (excludePaymentId && String(r.id ?? "") === excludePaymentId) return sum;
    return clamp2(sum + Number(r.amount ?? 0));
  }, 0);

  return { ok: true, outstanding: clamp2(totalSales - totalPayments) };
}

export async function saveCustomerPayment(input: SavePaymentInput) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(input.id ?? "").trim();
  const customer_id = String(input.customer_id ?? "").trim();
  const payment_date = normalizeDate(input.payment_date);
  const bank_date = normalizeDate(input.bank_date || input.payment_date);
  const payment_account = String(input.payment_account ?? "").trim();
  const payment_method = String(input.payment_method ?? "Cash").trim() || "Cash";
  const amount = clamp2(Number(input.amount ?? 0));
  const reference = String(input.reference ?? "").trim();
  const notes = String(input.notes ?? "").trim();

  if (!customer_id) return { error: "Customer is required." };
  if (!payment_date) return { error: "Transaction Date is required." };
  if (amount <= 0) return { error: "Amount must be greater than 0." };

  if (id) {
    const { error: updateErr } = await supabase
      .from("customer_payments")
      .update({
        customer_id,
        payment_date,
        bank_date: bank_date || null,
        payment_account: payment_account || null,
        payment_method,
        amount,
        reference: reference || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organization_id", orgId);
    if (updateErr) return { error: updateErr.message };
  } else {
    const payment_no = await generatePaymentNo(supabase, orgId, payment_date);
    const { error: insertErr } = await supabase.from("customer_payments").insert({
      organization_id: orgId,
      payment_no,
      customer_id,
      payment_date,
      bank_date: bank_date || null,
      payment_account: payment_account || null,
      payment_method,
      amount,
      reference: reference || null,
      notes: notes || null,
    });
    if (insertErr) return { error: insertErr.message };
  }

  revalidatePath("/dashboard/sales/customer-payments");
  revalidatePath("/dashboard/sales/customer-statement");
  return { ok: true };
}

export async function saveBatchCustomerPayments(rowsInput: BatchPaymentRowInput[]) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const rows = (rowsInput ?? [])
    .map((row) => ({
      customer_id: String(row.customer_id ?? "").trim(),
      payment_date: normalizeDate(row.payment_date),
      bank_date: normalizeDate(row.bank_date || row.payment_date),
      payment_account: String(row.payment_account ?? "").trim(),
      payment_method: String(row.payment_method ?? "Cash").trim() || "Cash",
      amount: clamp2(Number(row.amount ?? 0)),
      reference: String(row.reference ?? "").trim(),
      notes: String(row.notes ?? "").trim(),
    }))
    .filter((row) => row.customer_id && row.payment_date && row.amount > 0);

  if (rows.length === 0) return { error: "No valid payment rows to save." };

  for (const row of rows) {
    const payment_no = await generatePaymentNo(supabase, orgId, row.payment_date);
    const { error: insertErr } = await supabase.from("customer_payments").insert({
      organization_id: orgId,
      payment_no,
      customer_id: row.customer_id,
      payment_date: row.payment_date,
      bank_date: row.bank_date || null,
      payment_account: row.payment_account || null,
      payment_method: row.payment_method,
      amount: row.amount,
      reference: row.reference || null,
      notes: row.notes || null,
    });
    if (insertErr) return { error: insertErr.message };
  }

  revalidatePath("/dashboard/sales/customer-payments");
  revalidatePath("/dashboard/sales/customer-statement");
  return { ok: true, count: rows.length };
}

export async function deleteCustomerPayment(idInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(idInput ?? "").trim();
  if (!id) return { error: "Payment ID is required." };

  const { error: deleteErr } = await supabase
    .from("customer_payments")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (deleteErr) return { error: deleteErr.message };
  revalidatePath("/dashboard/sales/customer-payments");
  revalidatePath("/dashboard/sales/customer-statement");
  return { ok: true };
}
