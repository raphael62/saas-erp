"use server";

import { createClient } from "@/lib/supabase/server";

export type SupplierStatementFilter = "all" | "products" | "empties";

type SupplierRow = {
  id: string;
  name?: string | null;
  phone?: string | null;
  contact_person?: string | null;
  code?: string | null;
};

type StatementRow = {
  supplier_id: string;
  phone: string;
  contact_name: string;
  supplier_code: string;
  supplier_name: string;
  opening_balance: number;
  purchase_value: number;
  /** Sum of line empties_value on purchase invoices (returnables deposit — not in grand_total) */
  pi_empties_value: number;
  payment: number;
  /** Credits from empties dispatch (credit notes) */
  empties_credit: number;
  outstanding: number;
  balance: number;
};

type TxKind =
  | "purchase_invoice"
  | "purchase_invoice_empties"
  | "supplier_payment"
  | "empties_dispatch";

export type SupplierTxRow = {
  id: string;
  tx_kind: TxKind;
  tx_date: string;
  reference: string;
  /** P.O. / PI no. from purchase invoice (`pi_no`) or dispatch (`po_number`). */
  po_number: string | null;
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

type RawTx = {
  kind: TxKind;
  source_id: string;
  tx_date: string;
  debit: number;
  credit: number;
  reference: string;
  po_number: string | null;
  description: string;
  edit_path: string;
};

/**
 * Each purchase invoice row is immediately followed by its related empties rows (same date):
 * Empties Invoice (debit), then line-level Empties Purchase credits, then header credit notes.
 */
function sortSupplierLedgerRaw(raw: RawTx[]): RawTx[] {
  const pis = raw.filter((t) => t.kind === "purchase_invoice");
  const piEmpties = raw.filter((t) => t.kind === "purchase_invoice_empties");
  const payments = raw.filter((t) => t.kind === "supplier_payment");
  const dispatches = raw.filter((t) => t.kind === "empties_dispatch");

  const emptiesByPiId = new Map<string, RawTx[]>();
  for (const t of piEmpties) {
    const pid = purchaseInvoiceIdFromEmptiesSourceId(t.source_id);
    if (!pid) continue;
    const arr = emptiesByPiId.get(pid) ?? [];
    arr.push(t);
    emptiesByPiId.set(pid, arr);
  }
  for (const [pid, arr] of emptiesByPiId) {
    arr.sort((a, b) => {
      const rank = (x: RawTx) =>
        x.source_id.endsWith("-empties") &&
        !x.source_id.endsWith("-empties-refund") &&
        !x.source_id.endsWith("-empties-purchase")
          ? 0
          : x.source_id.endsWith("-empties-refund")
            ? 1
            : x.source_id.endsWith("-empties-purchase")
              ? 2
              : 3;
      const dr = rank(a) - rank(b);
      if (dr !== 0) return dr;
      return a.reference.localeCompare(b.reference, undefined, { numeric: true, sensitivity: "base" });
    });
  }

  const cmpRef = (a: RawTx, b: RawTx) =>
    a.reference.localeCompare(b.reference, undefined, { numeric: true, sensitivity: "base" });

  const dates = [...new Set(raw.map((r) => r.tx_date))].sort();
  const out: RawTx[] = [];

  for (const d of dates) {
    const pisD = pis.filter((t) => t.tx_date === d).sort(cmpRef);
    const emptiesPushed = new Set<string>();

    for (const pi of pisD) {
      out.push(pi);
      const followers = emptiesByPiId.get(pi.source_id) ?? [];
      for (const em of followers) {
        if (em.tx_date !== d) continue;
        out.push(em);
        emptiesPushed.add(em.source_id);
      }
    }

    for (const em of piEmpties.filter((t) => t.tx_date === d).sort(cmpRef)) {
      if (!emptiesPushed.has(em.source_id)) out.push(em);
    }

    for (const p of payments.filter((t) => t.tx_date === d).sort(cmpRef)) out.push(p);
    for (const x of dispatches.filter((t) => t.tx_date === d).sort(cmpRef)) out.push(x);
  }

  return out;
}

function kindPassesFilter(kind: TxKind, filter: SupplierStatementFilter): boolean {
  if (filter === "all") return true;
  if (filter === "products")
    return (
      kind === "purchase_invoice" ||
      kind === "purchase_invoice_empties" ||
      kind === "supplier_payment"
    );
  if (filter === "empties") return kind === "empties_dispatch";
  return true;
}

/** Net sum of empties_value per purchase_invoice_id (for opening / summary). */
function buildEmptiesTotalsByInvoice(
  lineRows: Array<{ purchase_invoice_id?: string | null; empties_value?: number | null }> | null
) {
  const m = new Map<string, number>();
  for (const row of lineRows ?? []) {
    const pid = String(row.purchase_invoice_id ?? "").trim();
    if (!pid) continue;
    const v = clamp2(Number(row.empties_value ?? 0));
    if (!v) continue;
    m.set(pid, clamp2((m.get(pid) ?? 0) + v));
  }
  return m;
}

/** Positive line empties → deposit (debit); negative line empties → refund (credit), both can appear on one PI. */
function buildEmptiesDebitCreditByInvoice(
  lineRows: Array<{ purchase_invoice_id?: string | null; empties_value?: number | null }> | null
) {
  const debit = new Map<string, number>();
  const credit = new Map<string, number>();
  for (const row of lineRows ?? []) {
    const pid = String(row.purchase_invoice_id ?? "").trim();
    if (!pid) continue;
    const v = clamp2(Number(row.empties_value ?? 0));
    if (v > 0) debit.set(pid, clamp2((debit.get(pid) ?? 0) + v));
    if (v < 0) credit.set(pid, clamp2((credit.get(pid) ?? 0) + Math.abs(v)));
  }
  return { debit, credit };
}

/** purchase_invoice id that an empties ledger row belongs to (source_id suffixes from getSupplierStatementTransactions). */
function purchaseInvoiceIdFromEmptiesSourceId(sourceId: string): string | null {
  if (sourceId.endsWith("-empties-refund")) return sourceId.slice(0, -"-empties-refund".length);
  if (sourceId.endsWith("-empties-purchase")) return sourceId.slice(0, -"-empties-purchase".length);
  if (sourceId.endsWith("-empties")) return sourceId.slice(0, -"-empties".length);
  return null;
}

export async function getSupplierStatement(fromDateInput: string, toDateInput: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const fromDate = normalizeDate(fromDateInput);
  const toDate = normalizeDate(toDateInput);
  if (!fromDate || !toDate) return { error: "Date From and Date To are required." };
  if (fromDate > toDate) return { error: "Date From cannot be after Date To." };

  const suppliersRes = await supabase
    .from("suppliers")
    .select("id, name, phone, contact_person, code")
    .eq("organization_id", orgId)
    .order("name");
  if (suppliersRes.error) return { error: suppliersRes.error.message };

  const piRes = await supabase
    .from("purchase_invoices")
    .select("id, supplier_id, invoice_date, grand_total")
    .eq("organization_id", orgId)
    .lte("invoice_date", toDate);
  const piMissing = Boolean(piRes.error && piRes.error.message.toLowerCase().includes("does not exist"));
  if (piRes.error && !piMissing) return { error: piRes.error.message };

  const piLinesRes = await supabase
    .from("purchase_invoice_lines")
    .select("purchase_invoice_id, empties_value")
    .eq("organization_id", orgId);
  const piLinesMissing = Boolean(
    piLinesRes.error && piLinesRes.error.message.toLowerCase().includes("does not exist")
  );
  if (piLinesRes.error && !piLinesMissing) return { error: piLinesRes.error.message };

  const emptiesTotalsByInvoice = piLinesMissing
    ? new Map<string, number>()
    : buildEmptiesTotalsByInvoice(
        piLinesRes.data as Array<{ purchase_invoice_id?: string | null; empties_value?: number | null }>
      );

  const payRes = await supabase
    .from("supplier_payments")
    .select("id, supplier_id, payment_date, amount")
    .eq("organization_id", orgId)
    .lte("payment_date", toDate);
  const paymentsMissing = Boolean(
    payRes.error && payRes.error.message.toLowerCase().includes("does not exist")
  );
  if (payRes.error && !paymentsMissing) return { error: payRes.error.message };

  const edRes = await supabase
    .from("empties_dispatches")
    .select("id, supplier_id, dispatch_date, total_value")
    .eq("organization_id", orgId)
    .lte("dispatch_date", toDate);
  const emptiesMissing = Boolean(
    edRes.error && edRes.error.message.toLowerCase().includes("does not exist")
  );
  if (edRes.error && !emptiesMissing) return { error: edRes.error.message };

  const openingBySupplier = new Map<string, number>();
  const purchaseBySupplier = new Map<string, number>();
  const piEmptiesBySupplier = new Map<string, number>();
  const paymentBySupplier = new Map<string, number>();
  const emptiesBySupplier = new Map<string, number>();

  for (const row of (piRes.data ?? []) as Array<{
    id?: string | null;
    supplier_id?: string | null;
    invoice_date?: string | null;
    grand_total?: number | null;
  }>) {
    const sid = String(row.supplier_id ?? "").trim();
    const date = normalizeDate(row.invoice_date);
    const invId = String(row.id ?? "").trim();
    if (!sid || !date || !invId) continue;
    const gt = clamp2(Number(row.grand_total ?? 0));
    const em = clamp2(emptiesTotalsByInvoice.get(invId) ?? 0);
    if (!gt && !em) continue;
    if (date < fromDate) {
      openingBySupplier.set(sid, clamp2((openingBySupplier.get(sid) ?? 0) + gt + em));
    } else {
      if (gt) {
        purchaseBySupplier.set(sid, clamp2((purchaseBySupplier.get(sid) ?? 0) + gt));
      }
      if (em) {
        piEmptiesBySupplier.set(sid, clamp2((piEmptiesBySupplier.get(sid) ?? 0) + em));
      }
    }
  }

  if (!paymentsMissing) {
    for (const row of (payRes.data ?? []) as Array<{
      supplier_id?: string | null;
      payment_date?: string | null;
      amount?: number | null;
    }>) {
      const sid = String(row.supplier_id ?? "").trim();
      const date = normalizeDate(row.payment_date);
      if (!sid || !date) continue;
      const amount = clamp2(Number(row.amount ?? 0));
      if (!amount) continue;
      if (date < fromDate) {
        openingBySupplier.set(sid, clamp2((openingBySupplier.get(sid) ?? 0) - amount));
      } else {
        paymentBySupplier.set(sid, clamp2((paymentBySupplier.get(sid) ?? 0) + amount));
      }
    }
  }

  if (!emptiesMissing) {
    for (const row of (edRes.data ?? []) as Array<{
      supplier_id?: string | null;
      dispatch_date?: string | null;
      total_value?: number | null;
    }>) {
      const sid = String(row.supplier_id ?? "").trim();
      const date = normalizeDate(row.dispatch_date);
      if (!sid || !date) continue;
      const amount = clamp2(Number(row.total_value ?? 0));
      if (!amount) continue;
      if (date < fromDate) {
        openingBySupplier.set(sid, clamp2((openingBySupplier.get(sid) ?? 0) - amount));
      } else {
        emptiesBySupplier.set(sid, clamp2((emptiesBySupplier.get(sid) ?? 0) + amount));
      }
    }
  }

  const rows: StatementRow[] = [];
  for (const s of (suppliersRes.data ?? []) as SupplierRow[]) {
    const supplierId = String(s.id);
    const opening = clamp2(openingBySupplier.get(supplierId) ?? 0);
    const purchase = clamp2(purchaseBySupplier.get(supplierId) ?? 0);
    const piEmpties = clamp2(piEmptiesBySupplier.get(supplierId) ?? 0);
    const payment = clamp2(paymentBySupplier.get(supplierId) ?? 0);
    const empties = clamp2(emptiesBySupplier.get(supplierId) ?? 0);
    const outstanding = clamp2(opening + purchase + piEmpties - payment - empties);
    if (!opening && !purchase && !piEmpties && !payment && !empties && !outstanding) continue;

    rows.push({
      supplier_id: supplierId,
      phone: String(s.phone ?? ""),
      contact_name: String(s.contact_person ?? ""),
      supplier_code: String(s.code ?? ""),
      supplier_name: String(s.name ?? ""),
      opening_balance: opening,
      purchase_value: purchase,
      pi_empties_value: piEmpties,
      payment,
      empties_credit: empties,
      outstanding,
      balance: outstanding,
    });
  }

  rows.sort((a, b) =>
    a.supplier_name.localeCompare(b.supplier_name, undefined, { sensitivity: "base" })
  );

  return {
    ok: true,
    fromDate,
    toDate,
    rows,
    payments_missing: paymentsMissing,
    empties_missing: emptiesMissing,
    purchase_invoices_missing: piMissing,
  };
}

export async function getSupplierStatementTransactions(
  supplierIdInput: string,
  fromDateInput: string,
  toDateInput: string,
  filter: SupplierStatementFilter = "all"
) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const supplierId = String(supplierIdInput ?? "").trim();
  const fromDate = normalizeDate(fromDateInput);
  const toDate = normalizeDate(toDateInput);
  if (!supplierId) return { error: "Supplier is required." };
  if (!fromDate || !toDate) return { error: "Date From and Date To are required." };
  if (fromDate > toDate) return { error: "Date From cannot be after Date To." };

  const piRes = await supabase
    .from("purchase_invoices")
    .select("id, invoice_no, supplier_inv_no, empties_inv_no, pi_no, invoice_date, grand_total")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId);
  const piMissing = Boolean(piRes.error && piRes.error.message.toLowerCase().includes("does not exist"));
  if (piRes.error && !piMissing) return { error: piRes.error.message };

  const invIds = (piRes.data ?? [])
    .map((r) => String((r as { id?: string | null }).id ?? "").trim())
    .filter(Boolean);

  let emptiesTotalsByInvoice = new Map<string, number>();
  let emptiesDebitByInvoice = new Map<string, number>();
  let emptiesCreditByInvoice = new Map<string, number>();
  if (invIds.length > 0 && !piMissing) {
    const piLinesRes = await supabase
      .from("purchase_invoice_lines")
      .select("purchase_invoice_id, empties_value")
      .eq("organization_id", orgId)
      .in("purchase_invoice_id", invIds);
    const piLinesMissing = Boolean(
      piLinesRes.error && piLinesRes.error.message.toLowerCase().includes("does not exist")
    );
    if (piLinesRes.error && !piLinesMissing) return { error: piLinesRes.error.message };
    if (!piLinesMissing) {
      const lineData = piLinesRes.data as Array<{
        purchase_invoice_id?: string | null;
        empties_value?: number | null;
      }>;
      emptiesTotalsByInvoice = buildEmptiesTotalsByInvoice(lineData);
      const split = buildEmptiesDebitCreditByInvoice(lineData);
      emptiesDebitByInvoice = split.debit;
      emptiesCreditByInvoice = split.credit;
    }
  }

  const payRes = await supabase
    .from("supplier_payments")
    .select("id, payment_no, payment_date, amount")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId);
  const paymentsMissing = Boolean(
    payRes.error && payRes.error.message.toLowerCase().includes("does not exist")
  );
  if (payRes.error && !paymentsMissing) return { error: payRes.error.message };

  const edRes = await supabase
    .from("empties_dispatches")
    .select("id, dispatch_no, credit_note_no, po_number, dispatch_date, total_value")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId);
  const emptiesMissing = Boolean(
    edRes.error && edRes.error.message.toLowerCase().includes("does not exist")
  );
  if (edRes.error && !emptiesMissing) return { error: edRes.error.message };

  let opening = 0;
  for (const row of (piRes.data ?? []) as Array<{
    id?: string | null;
    invoice_date?: string | null;
    grand_total?: number | null;
  }>) {
    const date = normalizeDate(row.invoice_date);
    const invId = String(row.id ?? "").trim();
    if (!date || date >= fromDate || !invId) continue;
    const gt = clamp2(Number(row.grand_total ?? 0));
    const em = clamp2(emptiesTotalsByInvoice.get(invId) ?? 0);
    opening = clamp2(opening + gt + em);
  }
  if (!paymentsMissing) {
    for (const row of (payRes.data ?? []) as Array<{
      payment_date?: string | null;
      amount?: number | null;
    }>) {
      const date = normalizeDate(row.payment_date);
      if (!date || date >= fromDate) continue;
      opening = clamp2(opening - Number(row.amount ?? 0));
    }
  }
  if (!emptiesMissing) {
    for (const row of (edRes.data ?? []) as Array<{
      dispatch_date?: string | null;
      total_value?: number | null;
    }>) {
      const date = normalizeDate(row.dispatch_date);
      if (!date || date >= fromDate) continue;
      opening = clamp2(opening - Number(row.total_value ?? 0));
    }
  }

  const raw: RawTx[] = [];

  for (const row of (piRes.data ?? []) as Array<{
    id?: string | null;
    invoice_no?: string | null;
    supplier_inv_no?: string | null;
    empties_inv_no?: string | null;
    pi_no?: string | null;
    invoice_date?: string | null;
    grand_total?: number | null;
  }>) {
    const id = String(row.id ?? "").trim();
    const date = normalizeDate(row.invoice_date);
    if (!id || !date || date < fromDate || date > toDate) continue;
    const gt = clamp2(Number(row.grand_total ?? 0));
    const emDebit = clamp2(emptiesDebitByInvoice.get(id) ?? 0);
    const emCreditLines = clamp2(emptiesCreditByInvoice.get(id) ?? 0);
    const supRef = String(row.supplier_inv_no ?? "").trim() || String(row.invoice_no ?? id);
    const poNum = String(row.pi_no ?? "").trim() || null;
    const emptiesRef =
      String(row.empties_inv_no ?? "").trim() || String(row.invoice_no ?? id);

    if (gt > 0) {
      raw.push({
        kind: "purchase_invoice",
        source_id: id,
        tx_date: date,
        debit: gt,
        credit: 0,
        reference: supRef,
        po_number: poNum,
        description: "Purchase Invoice",
        edit_path: `/dashboard/purchases/purchase-invoices?edit=${encodeURIComponent(id)}`,
      });
    }

    if (emDebit > 0) {
      raw.push({
        kind: "purchase_invoice_empties",
        source_id: `${id}-empties`,
        tx_date: date,
        debit: emDebit,
        credit: 0,
        reference: emptiesRef,
        po_number: poNum,
        description: "Empties Invoice",
        edit_path: `/dashboard/purchases/purchase-invoices?edit=${encodeURIComponent(id)}`,
      });
    }

    /** Empties Purchase is standalone: reference = supplier’s invoice no. (`supplier_inv_no`). */
    if (emCreditLines > 0) {
      raw.push({
        kind: "purchase_invoice_empties",
        source_id: `${id}-empties-refund`,
        tx_date: date,
        debit: 0,
        credit: emCreditLines,
        reference: supRef,
        po_number: poNum,
        description: "Empties Purchase",
        edit_path: `/dashboard/purchases/purchase-invoices?edit=${encodeURIComponent(id)}`,
      });
    }

    /** Standalone credit (e.g. credit note) when refund is in line totals, not empties_value. */
    if (gt < 0) {
      raw.push({
        kind: "purchase_invoice_empties",
        source_id: `${id}-empties-purchase`,
        tx_date: date,
        debit: 0,
        credit: clamp2(Math.abs(gt)),
        reference: supRef,
        po_number: poNum,
        description: "Empties Purchase",
        edit_path: `/dashboard/purchases/purchase-invoices?edit=${encodeURIComponent(id)}`,
      });
    }
  }

  if (!paymentsMissing) {
    for (const row of (payRes.data ?? []) as Array<{
      id?: string | null;
      payment_no?: string | null;
      payment_date?: string | null;
      amount?: number | null;
    }>) {
      const id = String(row.id ?? "").trim();
      const date = normalizeDate(row.payment_date);
      if (!id || !date || date < fromDate || date > toDate) continue;
      raw.push({
        kind: "supplier_payment",
        source_id: id,
        tx_date: date,
        debit: 0,
        credit: clamp2(Number(row.amount ?? 0)),
        reference: String(row.payment_no ?? id),
        po_number: null,
        description: "Payments",
        edit_path: `/dashboard/accounting/supplier-payments?edit=${encodeURIComponent(id)}`,
      });
    }
  }

  if (!emptiesMissing) {
    for (const row of (edRes.data ?? []) as Array<{
      id?: string | null;
      dispatch_no?: string | null;
      credit_note_no?: string | null;
      po_number?: string | null;
      dispatch_date?: string | null;
      total_value?: number | null;
    }>) {
      const id = String(row.id ?? "").trim();
      const date = normalizeDate(row.dispatch_date);
      if (!id || !date || date < fromDate || date > toDate) continue;
      const cn = String(row.credit_note_no ?? "").trim();
      const ref = cn || String(row.dispatch_no ?? id);
      const poNum = String(row.po_number ?? "").trim() || null;
      raw.push({
        kind: "empties_dispatch",
        source_id: id,
        tx_date: date,
        debit: 0,
        credit: clamp2(Number(row.total_value ?? 0)),
        reference: ref,
        po_number: poNum,
        description: "Empties Dispatch",
        edit_path: `/dashboard/purchases/empties-dispatch?edit=${encodeURIComponent(id)}`,
      });
    }
  }

  const sorted = sortSupplierLedgerRaw(raw);

  let running = clamp2(opening);
  let closingBalance = running;
  for (const t of sorted) {
    closingBalance = clamp2(closingBalance + t.debit - t.credit);
  }

  const rows: SupplierTxRow[] = [];
  running = clamp2(opening);
  for (const t of sorted) {
    running = clamp2(running + t.debit - t.credit);
    if (!kindPassesFilter(t.kind, filter)) continue;
    rows.push({
      id: `${t.kind}-${t.source_id}`,
      tx_kind: t.kind,
      tx_date: t.tx_date,
      reference: t.reference,
      po_number: t.po_number,
      description: t.description,
      debit: t.debit,
      credit: t.credit,
      balance: running,
      edit_path: t.edit_path,
    });
  }

  const totalDebit = rows.reduce((s, r) => clamp2(s + r.debit), 0);
  const totalCredit = rows.reduce((s, r) => clamp2(s + r.credit), 0);

  return {
    ok: true,
    opening: clamp2(opening),
    rows,
    closing_balance: closingBalance,
    total_debit: totalDebit,
    total_credit: totalCredit,
    payments_missing: paymentsMissing,
    empties_missing: emptiesMissing,
    purchase_invoices_missing: piMissing,
  };
}
