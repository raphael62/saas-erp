"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type SavePaymentInput = {
  id?: string;
  supplier_id: string;
  payment_date: string;
  bank_date?: string;
  payment_account?: string;
  payment_method?: string;
  amount: number;
  reference?: string;
  notes?: string;
  cheque_no?: string;
  purchase_invoice_id?: string | null;
};

type BatchAllocationRow = {
  purchase_invoice_id: string;
  amount: number;
  cheque_no?: string;
  /** Supplier inv no. (or fallback) stored as payment reference */
  reference: string;
};

type BatchPaymentInput = {
  supplier_id: string;
  payment_date: string;
  bank_date?: string;
  payment_account: string;
  payment_method?: string;
  notes?: string;
  allocations: BatchAllocationRow[];
};

function normalizeDate(input: string | null | undefined) {
  return String(input ?? "").slice(0, 10);
}

function clamp2(value: number) {
  return Number(value.toFixed(2));
}

async function getOrgContext() {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { supabase: ctx.supabase, orgId: null as string | null, error: ctx.error };
  return { supabase: ctx.supabase, orgId: ctx.orgId, error: null as string | null };
}

async function generatePaymentNo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  dateIso: string
) {
  const prefix = normalizeDate(dateIso) || new Date().toISOString().slice(0, 10);
  const like = `${prefix}-SP-%`;

  const { data } = await supabase
    .from("supplier_payments")
    .select("payment_no")
    .eq("organization_id", orgId)
    .ilike("payment_no", like)
    .order("payment_no", { ascending: false })
    .limit(1);

  const last = String((data?.[0] as { payment_no?: string } | undefined)?.payment_no ?? "");
  const suffix = last.startsWith(prefix) ? Number(last.slice(prefix.length + 4)) || 0 : 0;
  return `${prefix}-SP-${String(suffix + 1).padStart(3, "0")}`;
}

export async function getSuggestedPaymentNo(paymentDateInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const paymentDate = normalizeDate(paymentDateInput);
  if (!paymentDate) return { error: "Transaction Date is required." };

  const payment_no = await generatePaymentNo(supabase, orgId, paymentDate);
  return { ok: true, payment_no };
}

export async function getSupplierOutstanding(
  supplierIdInput: string,
  asOfDateInput?: string,
  excludePaymentIdInput?: string
) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const supplierId = String(supplierIdInput ?? "").trim();
  if (!supplierId) return { error: "Supplier is required." };

  const { data: invoices } = await supabase
    .from("purchase_invoices")
    .select("id, balance_os, invoice_date")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .gt("balance_os", 0);

  const totalOwed = (invoices ?? []).reduce(
    (sum, row) => clamp2(sum + Number((row as { balance_os?: number }).balance_os ?? 0)),
    0
  );

  return { ok: true, outstanding: totalOwed };
}

export async function getOutstandingInvoices(supplierIdInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const supplierId = String(supplierIdInput ?? "").trim();
  if (!supplierId) return { error: "Supplier is required." };

  const { data, error: fetchErr } = await supabase
    .from("purchase_invoices")
    .select("id, invoice_no, supplier_inv_no, invoice_date, grand_total, balance_os")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .gt("balance_os", 0)
    .order("invoice_date", { ascending: true });

  if (fetchErr) return { error: fetchErr.message };
  return { ok: true, invoices: data ?? [] };
}

async function adjustInvoiceBalance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  purchaseInvoiceId: string,
  delta: number
) {
  const { data: inv } = await supabase
    .from("purchase_invoices")
    .select("balance_os")
    .eq("id", purchaseInvoiceId)
    .single();
  const currentBalance = Number((inv as { balance_os?: number } | null)?.balance_os ?? 0);
  const newBalance = Math.max(0, clamp2(currentBalance + delta));
  await supabase
    .from("purchase_invoices")
    .update({ balance_os: newBalance, updated_at: new Date().toISOString() })
    .eq("id", purchaseInvoiceId);
}

export async function saveSupplierPayment(input: SavePaymentInput) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(input.id ?? "").trim();
  const supplier_id = String(input.supplier_id ?? "").trim();
  const payment_date = normalizeDate(input.payment_date);
  const bank_date = normalizeDate(input.bank_date || input.payment_date);
  const payment_account = String(input.payment_account ?? "").trim();
  const payment_method = String(input.payment_method ?? "Cash").trim() || "Cash";
  const amount = clamp2(Number(input.amount ?? 0));
  const reference = String(input.reference ?? "").trim();
  const notes = String(input.notes ?? "").trim();
  const cheque_no = String(input.cheque_no ?? "").trim() || null;
  const purchase_invoice_id_input = String(input.purchase_invoice_id ?? "").trim() || null;

  if (!supplier_id) return { error: "Supplier is required." };
  if (!payment_date) return { error: "Transaction Date is required." };
  if (amount <= 0) return { error: "Amount must be greater than 0." };
  if (!payment_account) return { error: "Pay From Account is required." };

  if (id) {
    const { data: oldRow } = await supabase
      .from("supplier_payments")
      .select("amount, purchase_invoice_id")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();

    const oldAmt = clamp2(Number((oldRow as { amount?: number } | null)?.amount ?? 0));
    const oldPi = String((oldRow as { purchase_invoice_id?: string | null } | null)?.purchase_invoice_id ?? "").trim();
    const effectivePi = purchase_invoice_id_input || oldPi || null;

    if (oldPi && clamp2(oldAmt - amount) !== 0) {
      await adjustInvoiceBalance(supabase, oldPi, oldAmt - amount);
    }

    const { error: updateErr } = await supabase
      .from("supplier_payments")
      .update({
        supplier_id,
        payment_date,
        bank_date: bank_date || null,
        payment_account,
        payment_method,
        amount,
        reference: reference || null,
        notes: notes || null,
        cheque_no,
        purchase_invoice_id: effectivePi,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organization_id", orgId);
    if (updateErr) return { error: updateErr.message };
  } else {
    const payment_no = await generatePaymentNo(supabase, orgId, payment_date);
    const { error: insertErr } = await supabase.from("supplier_payments").insert({
      organization_id: orgId,
      payment_no,
      supplier_id,
      payment_date,
      bank_date: bank_date || null,
      payment_account,
      payment_method,
      amount,
      reference: reference || null,
      notes: notes || null,
      cheque_no,
      purchase_invoice_id: purchase_invoice_id_input || null,
    });
    if (insertErr) return { error: insertErr.message };

    if (purchase_invoice_id_input) {
      await adjustInvoiceBalance(supabase, purchase_invoice_id_input, -amount);
    }
  }

  revalidatePath("/dashboard/accounting/supplier-payments");
  return { ok: true };
}

export async function saveBatchSupplierPayment(input: BatchPaymentInput) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const supplier_id = String(input.supplier_id ?? "").trim();
  const payment_date = normalizeDate(input.payment_date);
  const bank_date = normalizeDate(input.bank_date || input.payment_date);
  const payment_account = String(input.payment_account ?? "").trim();
  const payment_method = String(input.payment_method ?? "Cash").trim() || "Cash";
  const notes = String(input.notes ?? "").trim();

  const allocations = (input.allocations ?? [])
    .filter((a) => a.purchase_invoice_id && Number(a.amount ?? 0) > 0)
    .map((a) => ({
      purchase_invoice_id: a.purchase_invoice_id,
      amount: clamp2(Number(a.amount ?? 0)),
      cheque_no: String(a.cheque_no ?? "").trim() || null,
      reference: String(a.reference ?? "").trim() || null,
    }));

  if (!supplier_id) return { error: "Supplier is required." };
  if (!payment_date) return { error: "Transaction Date is required." };
  if (!payment_account) return { error: "Pay From Account is required." };
  if (allocations.length === 0) return { error: "Select at least one invoice with a payment amount." };

  for (const alloc of allocations) {
    const payment_no = await generatePaymentNo(supabase, orgId, payment_date);
    const { error: insertErr } = await supabase.from("supplier_payments").insert({
      organization_id: orgId,
      payment_no,
      supplier_id,
      payment_date,
      bank_date: bank_date || null,
      payment_account,
      payment_method,
      amount: alloc.amount,
      reference: alloc.reference,
      notes: notes || null,
      cheque_no: alloc.cheque_no,
      purchase_invoice_id: alloc.purchase_invoice_id,
    });
    if (insertErr) return { error: insertErr.message };

    await adjustInvoiceBalance(supabase, alloc.purchase_invoice_id, -alloc.amount);
  }

  revalidatePath("/dashboard/accounting/supplier-payments");
  return { ok: true, count: allocations.length };
}

export async function deleteSupplierPayment(idInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(idInput ?? "").trim();
  if (!id) return { error: "Payment ID is required." };

  const { data: row } = await supabase
    .from("supplier_payments")
    .select("amount, purchase_invoice_id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  const amt = clamp2(Number((row as { amount?: number } | null)?.amount ?? 0));
  const piId = String((row as { purchase_invoice_id?: string | null } | null)?.purchase_invoice_id ?? "").trim();

  if (piId) {
    await adjustInvoiceBalance(supabase, piId, amt);
  } else {
    const { data: allocs } = await supabase
      .from("supplier_payment_allocations")
      .select("purchase_invoice_id, amount")
      .eq("supplier_payment_id", id);

    if (allocs?.length) {
      for (const a of allocs as { purchase_invoice_id: string; amount: number }[]) {
        await adjustInvoiceBalance(supabase, a.purchase_invoice_id, a.amount);
      }
    }
  }

  const { error: deleteErr } = await supabase
    .from("supplier_payments")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (deleteErr) return { error: deleteErr.message };
  revalidatePath("/dashboard/accounting/supplier-payments");
  return { ok: true };
}
