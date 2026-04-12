"use server";

import { createClient } from "@/lib/supabase/server";
import { gateModulePageAction } from "@/lib/mutation-gate";
import { clamp2, parseISODate } from "@/lib/financial-reports";

export type ProfitAndLossResult = {
  ok: true;
  from: string;
  to: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  purchaseInvoicesTotal: number;
  salesTaxTotal: number;
  purchaseTaxTotal: number;
  invoiceCount: number;
  /** Net income for period (revenue − COGS). Operating expenses not in subledger. */
  netIncome: number;
} | { ok: false; error: string };

export type BalanceSheetLine = { label: string; amount: number; note?: string };
export type BalanceSheetResult =
  | {
      ok: true;
      asOf: string;
      assets: BalanceSheetLine[];
      liabilities: BalanceSheetLine[];
      equity: BalanceSheetLine[];
      totalAssets: number;
      totalLiabilities: number;
      totalEquity: number;
      check: number;
    }
  | { ok: false; error: string };

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export async function getProfitAndLoss(fromInput: string, toInput: string): Promise<ProfitAndLossResult> {
  const gate = await gateModulePageAction("accounting", "gl-reports", "view");
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase, orgId } = gate;

  const from = parseISODate(fromInput);
  const to = parseISODate(toInput);
  if (!from || !to) return { ok: false, error: "Invalid date range." };
  if (from > to) return { ok: false, error: "Start date must be before end date." };

  const { data: invRows, error: invErr } = await supabase
    .from("sales_invoices")
    .select("id, grand_total, sub_total, tax_total, refunded_at")
    .eq("organization_id", orgId)
    .gte("invoice_date", from)
    .lte("invoice_date", to)
    .not("posted_at", "is", null);

  if (invErr) return { ok: false, error: invErr.message };

  const invoices = (invRows ?? []) as Array<{
    id: string;
    grand_total?: number | null;
    sub_total?: number | null;
    tax_total?: number | null;
    refunded_at?: string | null;
  }>;

  const activeInvoices = invoices.filter((r) => !r.refunded_at);
  const invoiceIds = activeInvoices.map((r) => r.id);

  let revenue = 0;
  let salesTaxTotal = 0;
  for (const r of activeInvoices) {
    revenue += n(r.grand_total);
    salesTaxTotal += n(r.tax_total);
  }

  let cogs = 0;
  if (invoiceIds.length > 0) {
    const { data: lineRows, error: lineErr } = await supabase
      .from("sales_invoice_lines")
      .select("qty, product_id, sales_invoice_id")
      .eq("organization_id", orgId)
      .in("sales_invoice_id", invoiceIds);

    if (lineErr) return { ok: false, error: lineErr.message };

    const lines = (lineRows ?? []) as Array<{
      qty?: number | null;
      product_id?: string | null;
    }>;

    const productIds = [...new Set(lines.map((l) => String(l.product_id ?? "")).filter(Boolean))];
    const costByProduct = new Map<string, number>();
    if (productIds.length > 0) {
      const { data: products } = await supabase.from("products").select("id, cost_price").eq("organization_id", orgId).in("id", productIds);
      for (const p of products ?? []) {
        const row = p as { id: string; cost_price?: number | null };
        costByProduct.set(String(row.id), n(row.cost_price));
      }
    }

    for (const line of lines) {
      const pid = String(line.product_id ?? "");
      const unitCost = costByProduct.get(pid) ?? 0;
      const qty = n(line.qty);
      cogs += qty * unitCost;
    }
  }

  const { data: piRows, error: piErr } = await supabase
    .from("purchase_invoices")
    .select("grand_total, tax_total")
    .eq("organization_id", orgId)
    .gte("invoice_date", from)
    .lte("invoice_date", to);

  if (piErr) return { ok: false, error: piErr.message };

  let purchaseInvoicesTotal = 0;
  let purchaseTaxTotal = 0;
  for (const r of piRows ?? []) {
    const row = r as { grand_total?: number | null; tax_total?: number | null };
    purchaseInvoicesTotal += n(row.grand_total);
    purchaseTaxTotal += n(row.tax_total);
  }

  const grossProfit = revenue - cogs;
  const netIncome = grossProfit;

  return {
    ok: true,
    from,
    to,
    revenue: clamp2(revenue),
    cogs: clamp2(cogs),
    grossProfit: clamp2(grossProfit),
    purchaseInvoicesTotal: clamp2(purchaseInvoicesTotal),
    salesTaxTotal: clamp2(salesTaxTotal),
    purchaseTaxTotal: clamp2(purchaseTaxTotal),
    invoiceCount: activeInvoices.length,
    netIncome: clamp2(netIncome),
  };
}

export async function getBalanceSheet(asOfInput: string): Promise<BalanceSheetResult> {
  const gate = await gateModulePageAction("accounting", "gl-reports", "view");
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase, orgId } = gate;

  const asOf = parseISODate(asOfInput);
  if (!asOf) return { ok: false, error: "Invalid as-of date." };

  const { data: arData } = await supabase
    .from("sales_invoices")
    .select("balance_os")
    .eq("organization_id", orgId)
    .lte("invoice_date", asOf);

  const arTotal = (arData ?? []).reduce((s, r) => s + n((r as { balance_os?: number }).balance_os), 0);

  const { data: apData } = await supabase
    .from("purchase_invoices")
    .select("balance_os")
    .eq("organization_id", orgId)
    .lte("invoice_date", asOf);

  const apTotal = (apData ?? []).reduce((s, r) => s + n((r as { balance_os?: number }).balance_os), 0);

  let inventoryValue = 0;
  const { data: ilbRows, error: ilbErr } = await supabase
    .from("inventory_location_balances")
    .select("product_id, quantity")
    .eq("organization_id", orgId);

  if (!ilbErr && ilbRows) {
    const productIds = [...new Set((ilbRows ?? []).map((r) => String((r as { product_id?: string }).product_id ?? "")).filter(Boolean))];
    if (productIds.length > 0) {
      const { data: products } = await supabase.from("products").select("id, cost_price").eq("organization_id", orgId).in("id", productIds);
      const costById = new Map<string, number>();
      for (const p of products ?? []) {
        const row = p as { id: string; cost_price?: number | null };
        costById.set(String(row.id), n(row.cost_price));
      }
      for (const row of ilbRows ?? []) {
        const r = row as { product_id?: string; quantity?: number | null };
        const q = n(r.quantity);
        inventoryValue += q * (costById.get(String(r.product_id)) ?? 0);
      }
    }
  }

  const { data: paymentAccounts } = await supabase
    .from("payment_accounts")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true);

  const accounts = (paymentAccounts ?? []) as Array<{ id: string; code: string; name: string }>;

  const { data: custPay } = await supabase
    .from("customer_payments")
    .select("amount, payment_account, payment_date")
    .eq("organization_id", orgId)
    .lte("payment_date", asOf);

  const { data: supPay } = await supabase
    .from("supplier_payments")
    .select("amount, payment_account, payment_date")
    .eq("organization_id", orgId)
    .lte("payment_date", asOf);

  const { data: transfers } = await supabase
    .from("bank_transfers")
    .select("from_account_id, to_account_id, amount, transfer_date")
    .eq("organization_id", orgId)
    .lte("transfer_date", asOf);

  function matchAccountCode(ref: string | null | undefined): string | null {
    const t = String(ref ?? "").trim();
    if (!t) return null;
    const lower = t.toLowerCase();
    for (const a of accounts) {
      if (a.code.toLowerCase() === lower || a.name.toLowerCase() === lower) return a.id;
    }
    return null;
  }

  const cashByAccount = new Map<string, number>();
  for (const a of accounts) cashByAccount.set(a.id, 0);

  for (const row of custPay ?? []) {
    const r = row as { amount?: number; payment_account?: string | null };
    const aid = matchAccountCode(r.payment_account);
    if (!aid) continue;
    cashByAccount.set(aid, (cashByAccount.get(aid) ?? 0) + n(r.amount));
  }
  for (const row of supPay ?? []) {
    const r = row as { amount?: number; payment_account?: string | null };
    const aid = matchAccountCode(r.payment_account);
    if (!aid) continue;
    cashByAccount.set(aid, (cashByAccount.get(aid) ?? 0) - n(r.amount));
  }
  for (const row of transfers ?? []) {
    const r = row as { from_account_id?: string; to_account_id?: string; amount?: number };
    const amt = n(r.amount);
    if (r.from_account_id) {
      cashByAccount.set(r.from_account_id, (cashByAccount.get(r.from_account_id) ?? 0) - amt);
    }
    if (r.to_account_id) {
      cashByAccount.set(r.to_account_id, (cashByAccount.get(r.to_account_id) ?? 0) + amt);
    }
  }

  const { data: coaRows } = await supabase
    .from("chart_of_accounts")
    .select("account_code, account_name, account_type, opening_balance_ghs, current_balance_ghs")
    .eq("organization_id", orgId)
    .eq("is_active", true);

  const coa = (coaRows ?? []) as Array<{
    account_code: string;
    account_name: string;
    account_type: string;
    opening_balance_ghs?: number | null;
    current_balance_ghs?: number | null;
  }>;

  let ppe = 0;
  for (const c of coa) {
    if (String(c.account_type).toLowerCase() === "asset" && String(c.account_name).toLowerCase().includes("property")) {
      ppe += n(c.opening_balance_ghs) + n(c.current_balance_ghs);
    }
  }
  if (ppe === 0) {
    const ppeRow = coa.find((c) => String(c.account_code).startsWith("15"));
    if (ppeRow) ppe = n(ppeRow.opening_balance_ghs) + n(ppeRow.current_balance_ghs);
  }

  const assets: BalanceSheetLine[] = [];
  for (const a of accounts) {
    const bal = cashByAccount.get(a.id) ?? 0;
    if (Math.abs(bal) < 0.005) continue;
    assets.push({
      label: `Cash — ${a.code} ${a.name}`,
      amount: clamp2(bal),
      note: "From customer receipts, supplier payments, and bank transfers (no opening bank balance applied).",
    });
  }
  if (assets.length === 0 && accounts.length > 0) {
    assets.push({
      label: "Cash (payment accounts — no net movement matched)",
      amount: 0,
      note: "Match payment_account on receipts/payments to payment account codes, or record activity.",
    });
  }
  assets.push({ label: "Accounts receivable (outstanding sales invoices)", amount: clamp2(arTotal) });
  assets.push({
    label: "Inventory (qty × unit cost)",
    amount: clamp2(inventoryValue),
  });
  if (ppe > 0) {
    assets.push({ label: "Property, plant & equipment (COA balances)", amount: clamp2(ppe) });
  }

  const liabilities: BalanceSheetLine[] = [];
  liabilities.push({ label: "Accounts payable (outstanding purchase invoices)", amount: clamp2(apTotal) });

  let vatPayable = 0;
  const vatRow = coa.find((c) => String(c.account_code) === "2002" || String(c.account_name).toLowerCase().includes("vat"));
  if (vatRow) {
    vatPayable = n(vatRow.opening_balance_ghs) + n(vatRow.current_balance_ghs);
    if (Math.abs(vatPayable) > 0.005) {
      liabilities.push({ label: `${vatRow.account_code} ${vatRow.account_name} (COA)`, amount: clamp2(vatPayable) });
    }
  }

  const totalAssets = assets.reduce((s, x) => s + x.amount, 0);

  const totalLiabilities = liabilities.reduce((s, x) => s + x.amount, 0);

  const equity: BalanceSheetLine[] = [];
  let shareCapital = 0;
  const sc = coa.find((c) => String(c.account_code).startsWith("3001"));
  if (sc) shareCapital = n(sc.opening_balance_ghs) + n(sc.current_balance_ghs);
  if (Math.abs(shareCapital) > 0.005) {
    equity.push({ label: `${sc?.account_code} ${sc?.account_name}`, amount: clamp2(shareCapital) });
  }

  const equityLessResidual = equity.reduce((s, x) => s + x.amount, 0);
  const residual = totalAssets - totalLiabilities - equityLessResidual;
  equity.push({
    label: "Retained earnings / unallocated (balancing)",
    amount: clamp2(residual),
    note: "Includes opening equity not mapped to COA and cumulative results not separately posted.",
  });

  const totalEquity = equity.reduce((s, x) => s + x.amount, 0);
  const check = clamp2(totalAssets - totalLiabilities - totalEquity);

  return {
    ok: true,
    asOf,
    assets,
    liabilities,
    equity,
    totalAssets: clamp2(totalAssets),
    totalLiabilities: clamp2(totalLiabilities),
    totalEquity: clamp2(totalEquity),
    check,
  };
}

export type AccountingOverviewSummary = {
  ok: true;
  arOutstanding: number;
  apOutstanding: number;
  mtdRevenue: number;
} | { ok: false; error: string };

export async function getAccountingOverviewSummary(): Promise<AccountingOverviewSummary> {
  const gate = await gateModulePageAction("accounting", "chart-of-accounts", "view");
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase, orgId } = gate;

  const { data: ar } = await supabase.from("sales_invoices").select("balance_os").eq("organization_id", orgId);
  const arOutstanding = (ar ?? []).reduce((s, r) => s + n((r as { balance_os?: number }).balance_os), 0);

  const { data: ap } = await supabase.from("purchase_invoices").select("balance_os").eq("organization_id", orgId);
  const apOutstanding = (ap ?? []).reduce((s, r) => s + n((r as { balance_os?: number }).balance_os), 0);

  const start = new Date();
  start.setDate(1);
  const from = start.toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  const { data: inv } = await supabase
    .from("sales_invoices")
    .select("grand_total, refunded_at")
    .eq("organization_id", orgId)
    .gte("invoice_date", from)
    .lte("invoice_date", to)
    .not("posted_at", "is", null);

  let mtdRevenue = 0;
  for (const r of inv ?? []) {
    const row = r as { grand_total?: number; refunded_at?: string | null };
    if (!row.refunded_at) mtdRevenue += n(row.grand_total);
  }

  return {
    ok: true,
    arOutstanding: clamp2(arOutstanding),
    apOutstanding: clamp2(apOutstanding),
    mtdRevenue: clamp2(mtdRevenue),
  };
}
