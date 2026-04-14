"use server";

import { createClient } from "@/lib/supabase/server";
import { gateModulePageAction } from "@/lib/mutation-gate";
import { clamp2, parseISODate } from "@/lib/financial-reports";
import { getPaymentAccountAccessForUser } from "@/lib/payment-account-access";
import {
  posNum as n,
  type PosLineRefundRow,
  posCashRefundOut,
  posMerchRefundFromLines,
  posRefundBookDate,
} from "@/lib/pos-cash-movements";

type PaymentAccountRow = { id: string; code: string; name: string };

function matchAccountId(
  ref: string | null | undefined,
  accounts: PaymentAccountRow[]
): string | null {
  const t = String(ref ?? "").trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  for (const a of accounts) {
    if (a.code.toLowerCase() === lower || a.name.toLowerCase() === lower) return a.id;
  }
  return null;
}

export type CashReportAccountLine = {
  paymentAccountId: string;
  code: string;
  name: string;
  beginning: number;
  increase: number;
  decrease: number;
  ending: number;
};

export type CashReportGroup = {
  groupKey: string;
  /** e.g. "[1020] Cash on Hand" */
  groupLabel: string;
  accounts: CashReportAccountLine[];
  subTotal: { beginning: number; increase: number; decrease: number; ending: number };
};

export type CashReportResult =
  | {
      ok: true;
      from: string;
      to: string;
      groups: CashReportGroup[];
      grandTotal: { beginning: number; increase: number; decrease: number; ending: number };
    }
  | { ok: false; error: string };

type Bucket = { beginning: number; increase: number; decrease: number };

function emptyBucket(): Bucket {
  return { beginning: 0, increase: 0, decrease: 0 };
}

function addBucket(m: Map<string, Bucket>, id: string, patch: Partial<Bucket>) {
  const cur = m.get(id) ?? emptyBucket();
  m.set(id, {
    beginning: clamp2(cur.beginning + (patch.beginning ?? 0)),
    increase: clamp2(cur.increase + (patch.increase ?? 0)),
    decrease: clamp2(cur.decrease + (patch.decrease ?? 0)),
  });
}

export async function getCashReport(fromInput: string, toInput: string): Promise<CashReportResult> {
  const gate = await gateModulePageAction("accounting", "cash-report", "view");
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase, orgId, userId } = gate;
  const payAccess = await getPaymentAccountAccessForUser(supabase, userId, orgId);

  const from = parseISODate(fromInput);
  const to = parseISODate(toInput);
  if (!from || !to) return { ok: false, error: "Invalid date range." };
  if (from > to) return { ok: false, error: "Start date must be before end date." };

  const { data: paRows, error: paErr } = await supabase
    .from("payment_accounts")
    .select(
      "id, code, name, account_type, chart_of_account_id, chart_of_accounts(account_code, account_name)"
    )
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("code");

  if (paErr) return { ok: false, error: paErr.message };

  const paymentAccounts = (paRows ?? []).map((raw) => {
    const pa = raw as {
      id: string;
      code: string;
      name: string;
      account_type?: string;
      chart_of_account_id?: string | null;
      chart_of_accounts?: { account_code: string; account_name: string } | { account_code: string; account_name: string }[] | null;
    };
    const coaRaw = pa.chart_of_accounts;
    const coa = Array.isArray(coaRaw) ? coaRaw[0] : coaRaw;
    return {
      id: pa.id,
      code: pa.code,
      name: pa.name,
      account_type: pa.account_type,
      chart_of_account_id: pa.chart_of_account_id,
      coa: coa ?? null,
    };
  });

  const accountRows: PaymentAccountRow[] = paymentAccounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
  }));

  const buckets = new Map<string, Bucket>();

  for (const a of paymentAccounts) {
    buckets.set(a.id, emptyBucket());
  }

  const { data: custRows, error: cErr } = await supabase
    .from("customer_payments")
    .select("amount, payment_date, payment_account")
    .eq("organization_id", orgId)
    .lte("payment_date", to);

  if (cErr) return { ok: false, error: cErr.message };

  for (const row of custRows ?? []) {
    const r = row as { amount?: number; payment_date?: string; payment_account?: string | null };
    const aid = matchAccountId(r.payment_account, accountRows);
    if (!aid || !buckets.has(aid)) continue;
    const d = String(r.payment_date ?? "").slice(0, 10);
    if (!d) continue;
    const amt = n(r.amount);
    if (d < from) addBucket(buckets, aid, { beginning: amt });
    else if (d >= from && d <= to) addBucket(buckets, aid, { increase: amt });
  }

  const { data: supRows, error: sErr } = await supabase
    .from("supplier_payments")
    .select("amount, payment_date, payment_account")
    .eq("organization_id", orgId)
    .lte("payment_date", to);

  if (sErr) return { ok: false, error: sErr.message };

  for (const row of supRows ?? []) {
    const r = row as { amount?: number; payment_date?: string; payment_account?: string | null };
    const aid = matchAccountId(r.payment_account, accountRows);
    if (!aid || !buckets.has(aid)) continue;
    const d = String(r.payment_date ?? "").slice(0, 10);
    if (!d) continue;
    const amt = n(r.amount);
    if (d < from) addBucket(buckets, aid, { beginning: -amt });
    else if (d >= from && d <= to) addBucket(buckets, aid, { decrease: amt });
  }

  const { data: trRows, error: tErr } = await supabase
    .from("bank_transfers")
    .select("from_account_id, to_account_id, amount, transfer_date")
    .eq("organization_id", orgId)
    .lte("transfer_date", to);

  if (tErr) return { ok: false, error: tErr.message };

  for (const row of trRows ?? []) {
    const r = row as { from_account_id?: string; to_account_id?: string; amount?: number; transfer_date?: string };
    const d = String(r.transfer_date ?? "").slice(0, 10);
    if (!d) continue;
    const amt = n(r.amount);
    const fromId = String(r.from_account_id ?? "");
    const toId = String(r.to_account_id ?? "");
    if (d < from) {
      if (buckets.has(fromId)) addBucket(buckets, fromId, { beginning: -amt });
      if (buckets.has(toId)) addBucket(buckets, toId, { beginning: amt });
    } else if (d >= from && d <= to) {
      if (buckets.has(fromId)) addBucket(buckets, fromId, { decrease: amt });
      if (buckets.has(toId)) addBucket(buckets, toId, { increase: amt });
    }
  }

  const { data: posRows, error: posErr } = await supabase
    .from("sales_invoices")
    .select("id, payment_account_id, grand_total, balance_os, invoice_date, refunded_at")
    .eq("organization_id", orgId)
    .eq("type_status", "pos")
    .not("payment_account_id", "is", null)
    .lte("invoice_date", to);

  if (posErr) return { ok: false, error: posErr.message };

  const posList = (posRows ?? []) as Array<{
    id: string;
    payment_account_id?: string | null;
    grand_total?: number;
    balance_os?: number;
    invoice_date?: string;
    refunded_at?: string | null;
  }>;
  const posIds = posList.map((p) => p.id).filter(Boolean);
  const linesByInvoice = new Map<string, PosLineRefundRow[]>();
  if (posIds.length > 0) {
    const { data: lineRows, error: lineErr } = await supabase
      .from("sales_invoice_lines")
      .select("sales_invoice_id, qty, cl_qty, refunded_qty, refunded_cl_qty, value_tax_inc, updated_at")
      .eq("organization_id", orgId)
      .in("sales_invoice_id", posIds);
    if (lineErr) return { ok: false, error: lineErr.message };
    for (const raw of lineRows ?? []) {
      const ln = raw as PosLineRefundRow & { sales_invoice_id?: string };
      const iid = String(ln.sales_invoice_id ?? "").trim();
      if (!iid) continue;
      const arr = linesByInvoice.get(iid) ?? [];
      arr.push(ln);
      linesByInvoice.set(iid, arr);
    }
  }

  for (const r of posList) {
    const aid = String(r.payment_account_id ?? "").trim();
    if (!aid || !buckets.has(aid)) continue;
    const saleD = String(r.invoice_date ?? "").slice(0, 10);
    if (!saleD) continue;
    const collected = clamp2(n(r.grand_total) - n(r.balance_os));
    if (collected <= 0) continue;
    const { merchRefund, lastRefundLineTs } = posMerchRefundFromLines(linesByInvoice.get(r.id) ?? []);
    const refundCash = posCashRefundOut(collected, merchRefund);
    const refundD = refundCash > 0 ? posRefundBookDate(saleD, r.refunded_at, lastRefundLineTs) : "";

    if (saleD < from) addBucket(buckets, aid, { beginning: collected });
    else if (saleD >= from && saleD <= to) addBucket(buckets, aid, { increase: collected });

    if (refundCash > 0 && refundD) {
      if (refundD < from) addBucket(buckets, aid, { beginning: -refundCash });
      else if (refundD >= from && refundD <= to) addBucket(buckets, aid, { decrease: refundCash });
    }
  }

  type GroupAcc = {
    paymentAccountId: string;
    code: string;
    name: string;
    beginning: number;
    increase: number;
    decrease: number;
    ending: number;
    sortKey: string;
  };

  const groupMap = new Map<string, { label: string; sortKey: string; accounts: GroupAcc[] }>();

  for (const pa of paymentAccounts) {
    const b = buckets.get(pa.id) ?? emptyBucket();
    const ending = clamp2(b.beginning + b.increase - b.decrease);
    const coa = pa.coa;
    const groupKey = pa.chart_of_account_id ?? `__unclassified__`;
    const groupLabel = coa
      ? `[${coa.account_code}] ${coa.account_name}`
      : `[—] ${(() => {
          const t = String(pa.account_type ?? "bank").toLowerCase();
          return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Bank";
        })()} · Unclassified`;
    const groupSort = coa ? coa.account_code : `zzz-${pa.account_type ?? "x"}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, { label: groupLabel, sortKey: groupSort, accounts: [] });
    }

    groupMap.get(groupKey)!.accounts.push({
      paymentAccountId: pa.id,
      code: pa.code,
      name: pa.name,
      beginning: clamp2(b.beginning),
      increase: clamp2(b.increase),
      decrease: clamp2(b.decrease),
      ending,
      sortKey: pa.code,
    });
  }

  const groups: CashReportGroup[] = [...groupMap.entries()]
    .sort((a, b) => a[1].sortKey.localeCompare(b[1].sortKey))
    .map(([key, g]) => {
      const accounts = g.accounts.sort((x, y) => x.sortKey.localeCompare(y.sortKey));
      const subTotal = accounts.reduce(
        (acc, row) => ({
          beginning: clamp2(acc.beginning + row.beginning),
          increase: clamp2(acc.increase + row.increase),
          decrease: clamp2(acc.decrease + row.decrease),
          ending: clamp2(acc.ending + row.ending),
        }),
        { beginning: 0, increase: 0, decrease: 0, ending: 0 }
      );
      return {
        groupKey: key,
        groupLabel: g.label,
        accounts,
        subTotal,
      };
    });

  const grandTotal = groups.reduce(
    (acc, g) => ({
      beginning: clamp2(acc.beginning + g.subTotal.beginning),
      increase: clamp2(acc.increase + g.subTotal.increase),
      decrease: clamp2(acc.decrease + g.subTotal.decrease),
      ending: clamp2(acc.ending + g.subTotal.ending),
    }),
    { beginning: 0, increase: 0, decrease: 0, ending: 0 }
  );

  return { ok: true, from, to, groups, grandTotal };
}

export type CashTxRow = {
  kind: "customer" | "supplier" | "transfer" | "pos" | "pos_refund";
  id: string;
  date: string;
  bankDate: string;
  docNo: string;
  /** e.g. "In - Customer receipt", "Out - Bank transfer" */
  txnTypeLabel: string;
  counterpartyCode: string;
  counterpartyName: string;
  details: string;
  increase: number;
  decrease: number;
  editHref: string;
};

export type CashTransactionsResult =
  | {
      ok: true;
      rows: CashTxRow[];
      paymentAccountLabel: string;
      paymentAccountName: string;
      coaGroupLabel: string;
      beginningBalance: number;
    }
  | { ok: false; error: string };

async function beginningBalanceBefore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  paymentAccountId: string,
  accountRows: PaymentAccountRow[],
  fromDate: string
): Promise<number> {
  let beginning = 0;

  const { data: custRows, error: cErr } = await supabase
    .from("customer_payments")
    .select("amount, payment_date, payment_account")
    .eq("organization_id", orgId)
    .lt("payment_date", fromDate);

  if (cErr) throw new Error(cErr.message);

  for (const row of custRows ?? []) {
    const r = row as { amount?: number; payment_date?: string; payment_account?: string | null };
    const aid = matchAccountId(r.payment_account, accountRows);
    if (aid !== paymentAccountId) continue;
    beginning = clamp2(beginning + n(r.amount));
  }

  const { data: supRows, error: sErr } = await supabase
    .from("supplier_payments")
    .select("amount, payment_date, payment_account")
    .eq("organization_id", orgId)
    .lt("payment_date", fromDate);

  if (sErr) throw new Error(sErr.message);

  for (const row of supRows ?? []) {
    const r = row as { amount?: number; payment_date?: string; payment_account?: string | null };
    const aid = matchAccountId(r.payment_account, accountRows);
    if (aid !== paymentAccountId) continue;
    beginning = clamp2(beginning - n(r.amount));
  }

  const { data: trRows, error: tErr } = await supabase
    .from("bank_transfers")
    .select("from_account_id, to_account_id, amount, transfer_date")
    .eq("organization_id", orgId)
    .lt("transfer_date", fromDate);

  if (tErr) throw new Error(tErr.message);

  for (const row of trRows ?? []) {
    const r = row as {
      from_account_id?: string;
      to_account_id?: string;
      amount?: number;
      transfer_date?: string;
    };
    const amt = n(r.amount);
    const fromId = String(r.from_account_id ?? "");
    const toId = String(r.to_account_id ?? "");
    if (toId === paymentAccountId) beginning = clamp2(beginning + amt);
    if (fromId === paymentAccountId) beginning = clamp2(beginning - amt);
  }

  const { data: posBegInv, error: posBegErr } = await supabase
    .from("sales_invoices")
    .select("id, invoice_date, grand_total, balance_os, refunded_at")
    .eq("organization_id", orgId)
    .eq("type_status", "pos")
    .eq("payment_account_id", paymentAccountId)
    .lt("invoice_date", fromDate);

  if (posBegErr) throw new Error(posBegErr.message);

  const posBegList = (posBegInv ?? []) as Array<{
    id: string;
    invoice_date?: string;
    grand_total?: number;
    balance_os?: number;
    refunded_at?: string | null;
  }>;
  const begIds = posBegList.map((p) => p.id).filter(Boolean);
  const begLinesByInv = new Map<string, PosLineRefundRow[]>();
  if (begIds.length > 0) {
    const { data: begLines, error: begLineErr } = await supabase
      .from("sales_invoice_lines")
      .select("sales_invoice_id, qty, cl_qty, refunded_qty, refunded_cl_qty, value_tax_inc, updated_at")
      .eq("organization_id", orgId)
      .in("sales_invoice_id", begIds);
    if (begLineErr) throw new Error(begLineErr.message);
    for (const raw of begLines ?? []) {
      const ln = raw as PosLineRefundRow & { sales_invoice_id?: string };
      const iid = String(ln.sales_invoice_id ?? "").trim();
      if (!iid) continue;
      const arr = begLinesByInv.get(iid) ?? [];
      arr.push(ln);
      begLinesByInv.set(iid, arr);
    }
  }

  for (const r of posBegList) {
    const saleD = String(r.invoice_date ?? "").slice(0, 10);
    if (!saleD) continue;
    const collected = clamp2(n(r.grand_total) - n(r.balance_os));
    if (collected <= 0) continue;
    beginning = clamp2(beginning + collected);
    const { merchRefund, lastRefundLineTs } = posMerchRefundFromLines(begLinesByInv.get(r.id) ?? []);
    const refundCash = posCashRefundOut(collected, merchRefund);
    const refundD = refundCash > 0 ? posRefundBookDate(saleD, r.refunded_at, lastRefundLineTs) : "";
    if (refundCash > 0 && refundD && refundD < fromDate) beginning = clamp2(beginning - refundCash);
  }

  return beginning;
}

function detailParts(...parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

export async function getCashAccountTransactions(
  paymentAccountId: string,
  fromInput: string,
  toInput: string
): Promise<CashTransactionsResult> {
  const gate = await gateModulePageAction("accounting", "cash-report", "view");
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase, orgId, userId } = gate;
  const payAccess = await getPaymentAccountAccessForUser(supabase, userId, orgId);
  if (!payAccess.unrestricted && !payAccess.allowedIds.has(paymentAccountId)) {
    return { ok: false, error: "This payment account is not assigned to you." };
  }

  const from = parseISODate(fromInput);
  const to = parseISODate(toInput);
  if (!from || !to) return { ok: false, error: "Invalid date range." };
  if (from > to) return { ok: false, error: "Start date must be before end date." };

  const { data: allPaRows, error: allPaErr } = await supabase
    .from("payment_accounts")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true);

  if (allPaErr) return { ok: false, error: allPaErr.message };

  const accountRows: PaymentAccountRow[] = (allPaRows ?? []).map((raw) => {
    const p = raw as { id: string; code: string; name: string };
    return { id: p.id, code: p.code, name: p.name };
  });

  const { data: pa, error: paErr } = await supabase
    .from("payment_accounts")
    .select(
      "id, code, name, chart_of_account_id, chart_of_accounts(account_code, account_name)"
    )
    .eq("organization_id", orgId)
    .eq("id", paymentAccountId)
    .maybeSingle();

  if (paErr || !pa) return { ok: false, error: paErr?.message ?? "Account not found." };

  const paTyped = pa as {
    id: string;
    code: string;
    name: string;
    chart_of_account_id?: string | null;
    chart_of_accounts?: { account_code: string; account_name: string } | { account_code: string; account_name: string }[] | null;
  };
  const coaRaw = paTyped.chart_of_accounts;
  const coa = Array.isArray(coaRaw) ? coaRaw[0] : coaRaw;
  const coaGroupLabel = coa
    ? `[${coa.account_code}] ${coa.account_name}`
    : "Unclassified";

  const paRow = { id: paTyped.id, code: paTyped.code, name: paTyped.name };
  const paymentAccountLabel = `${paRow.code} — ${paRow.name}`;

  let beginningBalance = 0;
  try {
    beginningBalance = await beginningBalanceBefore(supabase, orgId, paRow.id, accountRows, from);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load opening balance." };
  }

  const rows: CashTxRow[] = [];

  const { data: custRows, error: cErr } = await supabase
    .from("customer_payments")
    .select(
      "id, payment_no, amount, payment_date, bank_date, payment_account, customer_id, reference, notes"
    )
    .eq("organization_id", orgId)
    .gte("payment_date", from)
    .lte("payment_date", to)
    .order("payment_date", { ascending: true })
    .order("payment_no", { ascending: true });

  if (cErr) return { ok: false, error: cErr.message };

  const custIds = [
    ...new Set(
      (custRows ?? [])
        .map((row) => String((row as { customer_id?: string | null }).customer_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  const customerNameById = new Map<string, string>();
  if (custIds.length > 0) {
    const { data: custNames } = await supabase.from("customers").select("id, name").eq("organization_id", orgId).in("id", custIds);
    for (const row of custNames ?? []) {
      const x = row as { id: string; name?: string | null };
      customerNameById.set(x.id, String(x.name ?? "").trim());
    }
  }

  for (const row of custRows ?? []) {
    const r = row as {
      id: string;
      payment_no?: string;
      amount?: number;
      payment_date?: string;
      bank_date?: string | null;
      payment_account?: string | null;
      customer_id?: string | null;
      reference?: string | null;
      notes?: string | null;
    };
    if (matchAccountId(r.payment_account, accountRows) !== paRow.id) continue;
    const custName = r.customer_id ? customerNameById.get(r.customer_id) ?? "" : "";
    rows.push({
      kind: "customer",
      id: r.id,
      date: String(r.payment_date ?? "").slice(0, 10),
      bankDate: String(r.bank_date ?? "").slice(0, 10) || "",
      docNo: String(r.payment_no ?? ""),
      txnTypeLabel: "In - Customer receipt",
      counterpartyCode: "",
      counterpartyName: custName,
      details: detailParts(r.reference, r.notes),
      increase: clamp2(n(r.amount)),
      decrease: 0,
      editHref: `/dashboard/sales/customer-payments?edit=${encodeURIComponent(r.id)}`,
    });
  }

  const { data: posTxRows, error: posTxErr } = await supabase
    .from("sales_invoices")
    .select(
      "id, invoice_no, invoice_date, grand_total, balance_os, customer_id, notes, payment_method, refunded_at"
    )
    .eq("organization_id", orgId)
    .eq("type_status", "pos")
    .eq("payment_account_id", paRow.id)
    .lte("invoice_date", to)
    .order("invoice_date", { ascending: true })
    .order("invoice_no", { ascending: true });

  if (posTxErr) return { ok: false, error: posTxErr.message };

  const posTxList = (posTxRows ?? []) as Array<{
    id: string;
    invoice_no?: string;
    invoice_date?: string;
    grand_total?: number;
    balance_os?: number;
    customer_id?: string | null;
    notes?: string | null;
    payment_method?: string | null;
    refunded_at?: string | null;
  }>;
  const posTxIds = posTxList.map((p) => p.id).filter(Boolean);
  const txLinesByInvoice = new Map<string, PosLineRefundRow[]>();
  if (posTxIds.length > 0) {
    const { data: txLines, error: txLineErr } = await supabase
      .from("sales_invoice_lines")
      .select("sales_invoice_id, qty, cl_qty, refunded_qty, refunded_cl_qty, value_tax_inc, updated_at")
      .eq("organization_id", orgId)
      .in("sales_invoice_id", posTxIds);
    if (txLineErr) return { ok: false, error: txLineErr.message };
    for (const raw of txLines ?? []) {
      const ln = raw as PosLineRefundRow & { sales_invoice_id?: string };
      const iid = String(ln.sales_invoice_id ?? "").trim();
      if (!iid) continue;
      const arr = txLinesByInvoice.get(iid) ?? [];
      arr.push(ln);
      txLinesByInvoice.set(iid, arr);
    }
  }

  const posExtraCustIds = [
    ...new Set(
      posTxList
        .map((row) => String(row.customer_id ?? "").trim())
        .filter((id) => id && !customerNameById.has(id))
    ),
  ];
  if (posExtraCustIds.length > 0) {
    const { data: posCustNames } = await supabase
      .from("customers")
      .select("id, name")
      .eq("organization_id", orgId)
      .in("id", posExtraCustIds);
    for (const row of posCustNames ?? []) {
      const x = row as { id: string; name?: string | null };
      customerNameById.set(x.id, String(x.name ?? "").trim());
    }
  }

  for (const r of posTxList) {
    const saleD = String(r.invoice_date ?? "").slice(0, 10);
    if (!saleD) continue;
    const collected = clamp2(n(r.grand_total) - n(r.balance_os));
    const { merchRefund, lastRefundLineTs } = posMerchRefundFromLines(txLinesByInvoice.get(r.id) ?? []);
    const refundCash = posCashRefundOut(collected, merchRefund);
    const refundD = refundCash > 0 ? posRefundBookDate(saleD, r.refunded_at, lastRefundLineTs) : "";
    const custName = r.customer_id ? customerNameById.get(r.customer_id) ?? "" : "";

    if (collected > 0 && saleD >= from && saleD <= to) {
      rows.push({
        kind: "pos",
        id: r.id,
        date: saleD,
        bankDate: "",
        docNo: String(r.invoice_no ?? ""),
        txnTypeLabel: "In - POS collection",
        counterpartyCode: "",
        counterpartyName: custName,
        details: detailParts(r.payment_method, r.notes),
        increase: collected,
        decrease: 0,
        editHref: `/dashboard/pos/receipts/${encodeURIComponent(r.id)}`,
      });
    }

    if (refundCash > 0 && refundD && refundD >= from && refundD <= to) {
      rows.push({
        kind: "pos_refund",
        id: `${r.id}-refund`,
        date: refundD,
        bankDate: "",
        docNo: String(r.invoice_no ?? ""),
        txnTypeLabel: "Out - POS refund",
        counterpartyCode: "",
        counterpartyName: custName,
        details: detailParts(`Receipt ${String(r.invoice_no ?? "")}`, r.notes),
        increase: 0,
        decrease: refundCash,
        editHref: `/dashboard/pos/receipts/${encodeURIComponent(r.id)}`,
      });
    }
  }

  const { data: supRows, error: sErr } = await supabase
    .from("supplier_payments")
    .select(
      "id, payment_no, amount, payment_date, bank_date, payment_account, supplier_id, reference, notes, cheque_no"
    )
    .eq("organization_id", orgId)
    .gte("payment_date", from)
    .lte("payment_date", to)
    .order("payment_date", { ascending: true })
    .order("payment_no", { ascending: true });

  if (sErr) return { ok: false, error: sErr.message };

  const supIdList = [
    ...new Set(
      (supRows ?? [])
        .map((row) => String((row as { supplier_id?: string | null }).supplier_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  const supplierById = new Map<string, { code: string; name: string }>();
  if (supIdList.length > 0) {
    const { data: supNames } = await supabase
      .from("suppliers")
      .select("id, name, code")
      .eq("organization_id", orgId)
      .in("id", supIdList);
    for (const row of supNames ?? []) {
      const x = row as { id: string; name?: string | null; code?: string | null };
      supplierById.set(x.id, {
        code: String(x.code ?? "").trim(),
        name: String(x.name ?? "").trim(),
      });
    }
  }

  for (const row of supRows ?? []) {
    const r = row as {
      id: string;
      payment_no?: string;
      amount?: number;
      payment_date?: string;
      bank_date?: string | null;
      payment_account?: string | null;
      supplier_id?: string | null;
      reference?: string | null;
      notes?: string | null;
      cheque_no?: string | null;
    };
    if (matchAccountId(r.payment_account, accountRows) !== paRow.id) continue;
    const sup = r.supplier_id ? supplierById.get(r.supplier_id) : undefined;
    const supName = sup?.name ?? "";
    const supCode = sup?.code ?? "";
    rows.push({
      kind: "supplier",
      id: r.id,
      date: String(r.payment_date ?? "").slice(0, 10),
      bankDate: String(r.bank_date ?? "").slice(0, 10) || "",
      docNo: String(r.payment_no ?? ""),
      txnTypeLabel: "Out - To Vendor",
      counterpartyCode: supCode,
      counterpartyName: supName,
      details: detailParts(r.cheque_no ? `Chq ${r.cheque_no}` : "", r.reference, r.notes),
      increase: 0,
      decrease: clamp2(n(r.amount)),
      editHref: `/dashboard/accounting/supplier-payments?edit=${encodeURIComponent(r.id)}`,
    });
  }

  const { data: trRows, error: tErr } = await supabase
    .from("bank_transfers")
    .select("id, transfer_no, transfer_date, from_account_id, to_account_id, amount, reference, notes")
    .eq("organization_id", orgId)
    .gte("transfer_date", from)
    .lte("transfer_date", to)
    .order("transfer_date", { ascending: true })
    .order("transfer_no", { ascending: true });

  if (tErr) return { ok: false, error: tErr.message };

  const transferList = (trRows ?? []) as Array<{
    id: string;
    transfer_no?: string;
    transfer_date?: string;
    from_account_id?: string;
    to_account_id?: string;
    amount?: number;
    reference?: string | null;
    notes?: string | null;
  }>;

  const idSet = new Set<string>();
  for (const r of transferList) {
    if (r.from_account_id) idSet.add(r.from_account_id);
    if (r.to_account_id) idSet.add(r.to_account_id);
  }
  const accountById = new Map<string, { code: string; name: string }>();
  if (idSet.size > 0) {
    const { data: paNames } = await supabase
      .from("payment_accounts")
      .select("id, code, name")
      .eq("organization_id", orgId)
      .in("id", [...idSet]);
    for (const row of paNames ?? []) {
      const x = row as { id: string; code?: string; name?: string };
      accountById.set(x.id, { code: String(x.code ?? ""), name: String(x.name ?? "") });
    }
  }

  for (const r of transferList) {
    const amt = clamp2(n(r.amount));
    const fromAcc = r.from_account_id ? accountById.get(r.from_account_id) : undefined;
    const toAcc = r.to_account_id ? accountById.get(r.to_account_id) : undefined;
    const fromLabel = fromAcc ? detailParts(fromAcc.code, fromAcc.name) : "—";
    const toLabel = toAcc ? detailParts(toAcc.code, toAcc.name) : "—";
    const detailLine = detailParts(r.reference, r.notes);
    if (r.to_account_id === paRow.id) {
      rows.push({
        kind: "transfer",
        id: `${r.id}-in`,
        date: String(r.transfer_date ?? "").slice(0, 10),
        bankDate: "",
        docNo: String(r.transfer_no ?? ""),
        txnTypeLabel: "In - Bank transfer",
        counterpartyCode: fromAcc?.code ?? "",
        counterpartyName: fromAcc?.name ?? "",
        details: detailLine || `From ${fromLabel}`,
        increase: amt,
        decrease: 0,
        editHref: `/dashboard/accounting/bank-transfers?edit=${encodeURIComponent(r.id)}`,
      });
    }
    if (r.from_account_id === paRow.id) {
      rows.push({
        kind: "transfer",
        id: `${r.id}-out`,
        date: String(r.transfer_date ?? "").slice(0, 10),
        bankDate: "",
        docNo: String(r.transfer_no ?? ""),
        txnTypeLabel: "Out - Bank transfer",
        counterpartyCode: toAcc?.code ?? "",
        counterpartyName: toAcc?.name ?? "",
        details: detailLine || `To ${toLabel}`,
        increase: 0,
        decrease: amt,
        editHref: `/dashboard/accounting/bank-transfers?edit=${encodeURIComponent(r.id)}`,
      });
    }
  }

  rows.sort((a, b) => {
    const c = a.date.localeCompare(b.date);
    if (c !== 0) return c;
    const d = a.docNo.localeCompare(b.docNo, undefined, { numeric: true });
    if (d !== 0) return d;
    const k = a.kind.localeCompare(b.kind);
    if (k !== 0) return k;
    return a.id.localeCompare(b.id);
  });

  return {
    ok: true,
    rows,
    paymentAccountLabel,
    paymentAccountName: paRow.name,
    coaGroupLabel,
    beginningBalance,
  };
}
