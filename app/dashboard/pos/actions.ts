"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getOrgContextForAction } from "@/lib/org-context";

async function getPosOrgContext() {
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { supabase: ctx.supabase, orgId: null as string | null, error: ctx.error };
  return { supabase: ctx.supabase, orgId: ctx.orgId, error: null as string | null };
}

function n(v: string | number | null | undefined): number {
  const raw = String(v ?? "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

export type PosSaleLineInput = {
  product_id: string;
  item_code: string;
  item_name: string;
  price_type: string;
  pack_unit: string;
  btl_qty: string;
  ctn_qty: string;
  price_tax_inc: string;
  tax_rate: string;
  value_tax_inc: string;
  isPromo?: boolean;
};

export type PosSaleInput = {
  saleDate: string;
  customerId: string;
  locationId: string;
  salesRepId: string;
  notes: string;
  lines: PosSaleLineInput[];
  subTotal: number;
  vatTotal: number;
  grandTotal: number;
  emptiesDeposit: number;
  emptiesRcvd: Record<string, number>;
  paymentMethod: string;
  amountPaid: number;
  paymentAccountId?: string | null;
  cashierId?: string;
};

function isEmptiesProduct(itemName: string): boolean {
  return String(itemName ?? "").toLowerCase().includes("empties");
}

function isPromoLine(line: PosSaleLineInput): boolean {
  return Boolean(
    String(line.item_name ?? "").startsWith("Free - ") || line.isPromo
  );
}

async function generatePosInvoiceNo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  saleDate: string
): Promise<string> {
  const prefix = `POS-${saleDate.replace(/-/g, "")}-`;
  const { data } = await supabase
    .from("sales_invoices")
    .select("invoice_no")
    .eq("organization_id", orgId)
    .eq("type_status", "pos")
    .like("invoice_no", `${prefix}%`)
    .order("invoice_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const last = (data as { invoice_no?: string } | null)?.invoice_no;
  let seq = 1;
  if (last) {
    const suffix = last.replace(prefix, "");
    const parsed = parseInt(suffix, 10);
    if (Number.isFinite(parsed)) seq = parsed + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function savePosSale(input: PosSaleInput) {
  const { supabase, orgId, error } = await getPosOrgContext();
  if (error || !orgId) return { error: error ?? "No organization" };

  const customerId = input.customerId?.trim() || null;
  const locationId = input.locationId?.trim() || null;
  const salesRepId = input.salesRepId?.trim() || null;
  if (!salesRepId) return { error: "Sales Rep is required" };

  const saleDate = String(input.saleDate ?? "").slice(0, 10);
  if (!saleDate) return { error: "Sale date is required" };

  const invoiceNo = await generatePosInvoiceNo(supabase, orgId, saleDate);

  const subTotal = n(input.subTotal);
  const vatTotal = n(input.vatTotal);
  const grandTotal = n(input.grandTotal);
  const emptiesDeposit = n(input.emptiesDeposit);
  const grandTotalWithEmpties = grandTotal + emptiesDeposit;

  const { data: inv, error: invErr } = await supabase
    .from("sales_invoices")
    .insert({
      organization_id: orgId,
      invoice_no: invoiceNo,
      customer_id: customerId,
      sales_rep_id: salesRepId,
      location_id: locationId,
      invoice_date: saleDate,
      type_status: "pos",
      notes: input.notes?.trim() || null,
      balance_os: 0,
      total_qty: 0,
      sub_total: subTotal,
      tax_total: vatTotal,
      grand_total: grandTotalWithEmpties,
      empties_value: emptiesDeposit,
      payment_method: input.paymentMethod || "cash",
      payment_account_id: input.paymentAccountId || null,
      cashier_id: input.cashierId || user.id,
      posted_at: new Date().toISOString(),
      posted_by: user.id,
    })
    .select("id")
    .single();

  if (invErr) return { error: invErr.message };
  const invoiceId = (inv as { id: string }).id;

  const lines = input.lines ?? [];
  if (lines.length === 0) return { error: "No line items" };

  const lineRows: Array<{
    organization_id: string;
    sales_invoice_id: string;
    product_id: string | null;
    item_name_snapshot: string;
    price_type: string;
    pack_unit: number;
    qty: number;
    cl_qty: number;
    free_qty: number;
    price_ex: number;
    price_tax_inc: number;
    tax_rate: number;
    tax_amount: number;
    value_tax_inc: number;
    vat_type: string;
    row_no: number;
    is_promo: boolean;
  }> = [];

  let rowNo = 0;
  const promoConsumption = new Map<
    string,
    { promotionId: string; cartons: number }[]
  >();

  for (const line of lines) {
    const productId = String(line.product_id ?? "").trim() || null;
    const packUnit = Math.max(0, n(line.pack_unit));
    const btlQty = n(line.btl_qty);
    const ctnQty = n(line.ctn_qty);
    const qtyCartons =
      btlQty !== 0 && packUnit > 0
        ? btlQty / packUnit
        : ctnQty !== 0
          ? ctnQty
          : 0;
    const qtyBottles =
      btlQty !== 0 ? btlQty : ctnQty !== 0 && packUnit > 0 ? ctnQty * packUnit : 0;
    const price = n(line.price_tax_inc);
    const value = n(line.value_tax_inc);
    const taxRate = n(line.tax_rate);
    const divisor = 1 + taxRate / 100;
    const priceEx = divisor > 0 ? price / divisor : price;
    const taxAmount = value - (divisor > 0 ? value / divisor : value);

    lineRows.push({
      organization_id: orgId,
      sales_invoice_id: invoiceId,
      product_id: productId,
      item_name_snapshot: line.item_name || "—",
      price_type: line.price_type || "",
      pack_unit: packUnit,
      qty: qtyBottles > 0 ? qtyBottles : qtyCartons,
      cl_qty: qtyCartons,
      free_qty: isPromoLine(line) ? qtyCartons : 0,
      price_ex: priceEx,
      price_tax_inc: price,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      value_tax_inc: value,
      vat_type: "inc",
      row_no: rowNo++,
      is_promo: isPromoLine(line),
    });
  }

  const { error: linesErr } = await supabase
    .from("sales_invoice_lines")
    .insert(lineRows);

  if (linesErr) {
    await supabase.from("sales_invoices").delete().eq("id", invoiceId);
    return { error: linesErr.message };
  }

  // Inventory deduction: deduct from products.stock_quantity for non-empties, non-promo lines
  const productDeductions = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isPromoLine(line) || isEmptiesProduct(line.item_name)) continue;
    const productId = String(line.product_id ?? "").trim();
    if (!productId) continue;
    const packUnit = Math.max(1, n(line.pack_unit));
    const btlQty = n(line.btl_qty);
    const ctnQty = n(line.ctn_qty);
    const qty =
      btlQty !== 0 ? btlQty : ctnQty !== 0 ? ctnQty * packUnit : 0;
    if (qty <= 0) continue;
    const curr = productDeductions.get(productId) ?? 0;
    productDeductions.set(productId, curr + qty);
  }

  for (const [productId, deductQty] of productDeductions) {
    const { data: prod } = await supabase
      .from("products")
      .select("stock_quantity")
      .eq("id", productId)
      .eq("organization_id", orgId)
      .single();
    const curr = n((prod as { stock_quantity?: number } | null)?.stock_quantity);
    await supabase
      .from("products")
      .update({
        stock_quantity: Math.max(0, curr - deductQty),
      })
      .eq("id", productId)
      .eq("organization_id", orgId);
  }

  // Promo consumption: update promotions.consumed_cartons
  const { data: promotionsData } = await supabase
    .from("promotions")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_active", true);
  const promotions = (promotionsData ?? []) as Array<{ id: string }>;

  const { data: rulesData } = await supabase
    .from("promotion_rules")
    .select("promotion_id, reward_product_id, reward_qty, reward_unit")
    .eq("organization_id", orgId);
  const rules = (rulesData ?? []) as Array<{
    promotion_id: string;
    reward_product_id: string;
    reward_qty?: number | null;
    reward_unit?: string | null;
  }>;

  const promoCartonsByPromoId = new Map<string, number>();
  for (const line of lines) {
    if (!isPromoLine(line)) continue;
    const productId = String(line.product_id ?? "").trim();
    if (!productId) continue;
    const packUnit = Math.max(1, n(line.pack_unit));
    const btlQty = n(line.btl_qty);
    const ctnQty = n(line.ctn_qty);
    const cartons =
      btlQty !== 0
        ? btlQty / packUnit
        : ctnQty !== 0
          ? ctnQty
          : 0;
    if (cartons <= 0) continue;
    for (const r of rules) {
      if (String(r.reward_product_id) === productId) {
        const promoId = String(r.promotion_id);
        const curr = promoCartonsByPromoId.get(promoId) ?? 0;
        promoCartonsByPromoId.set(promoId, curr + cartons);
      }
    }
  }

  for (const [promoId, cartons] of promoCartonsByPromoId) {
    const { data: promo } = await supabase
      .from("promotions")
      .select("consumed_cartons")
      .eq("id", promoId)
      .single();
    const consumed = n((promo as { consumed_cartons?: number } | null)?.consumed_cartons);
    await supabase
      .from("promotions")
      .update({ consumed_cartons: consumed + cartons })
      .eq("id", promoId)
      .eq("organization_id", orgId);
  }

  // Empties receive: when customer returns empties at POS, create empties_receives record
  const emptiesRcvdEntries = Object.entries(input.emptiesRcvd ?? {}).filter(
    ([, v]) => v != null && n(v) > 0
  );
  if (customerId && locationId && emptiesRcvdEntries.length > 0) {
    const { data: emptiesProducts } = await supabase
      .from("products")
      .select("id, code, name, empties_type")
      .eq("organization_id", orgId)
      .ilike("name", "%empties%");
    const emptiesByType = new Map<string, { id: string; code: string | null; name: string }>();
    for (const p of emptiesProducts ?? []) {
      const et = String((p as { empties_type?: string }).empties_type ?? "").trim().toLowerCase();
      if (et) emptiesByType.set(et, { id: (p as { id: string }).id, code: (p as { code?: string }).code ?? null, name: (p as { name: string }).name });
    }

    const productIds = [...new Set(lines.map((l) => String(l.product_id ?? "").trim()).filter(Boolean))] as string[];
    const { data: productRows } = await supabase
      .from("products")
      .select("id, empties_type, returnable")
      .eq("organization_id", orgId)
      .in("id", productIds);
    const productInfo = new Map<string, { empties_type: string; returnable: boolean }>();
    for (const p of productRows ?? []) {
      const r = p as { id: string; empties_type?: string | null; returnable?: boolean | null };
      const et = String(r.empties_type ?? "").trim().toLowerCase();
      if (et) productInfo.set(r.id, { empties_type: et, returnable: Boolean(r.returnable) });
    }

    const expectedByType = new Map<string, number>();
    const soldByType = new Map<string, number>();
    for (const line of lines) {
      const pid = String(line.product_id ?? "").trim();
      if (!pid) continue;
      const info = productInfo.get(pid);
      if (!info) continue;
      const packUnit = Math.max(1, n(line.pack_unit));
      const btlQty = n(line.btl_qty);
      const ctnQty = n(line.ctn_qty);
      const cartons = btlQty !== 0 && packUnit > 0 ? btlQty / packUnit : ctnQty;
      if (cartons <= 0) continue;
      const et = info.empties_type;
      if (info.returnable && !isEmptiesProduct(line.item_name)) {
        expectedByType.set(et, (expectedByType.get(et) ?? 0) + cartons);
      } else if (isEmptiesProduct(line.item_name)) {
        soldByType.set(et, (soldByType.get(et) ?? 0) + cartons);
      }
    }

    const receiveNoPrefix = `ERS-${saleDate.replace(/-/g, "")}-`;
    const { data: lastReceive } = await supabase
      .from("empties_receives")
      .select("receive_no")
      .eq("organization_id", orgId)
      .ilike("receive_no", `${receiveNoPrefix}%`)
      .order("receive_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastNo = (lastReceive as { receive_no?: string } | null)?.receive_no ?? "";
    const seq = lastNo.startsWith(receiveNoPrefix) ? parseInt(lastNo.slice(receiveNoPrefix.length), 10) || 0 : 0;
    const receiveNo = `${receiveNoPrefix}${String(seq + 1).padStart(3, "0")}`;

    type ReceiveLineRow = {
      organization_id: string;
      empties_receive_id: string;
      product_id: string;
      product_code_snapshot: string | null;
      product_name_snapshot: string;
      sold_qty: number;
      owed_qty: number;
      expected_qty: number;
      received_qty: number;
      os_qty: number;
      row_no: number;
    };
    const receiveLines: ReceiveLineRow[] = [];
    const stockDelta = new Map<string, number>();
    let rowNo = 0;
    for (const [emptiesType, receivedQty] of emptiesRcvdEntries) {
      const received = n(receivedQty);
      if (received <= 0) continue;
      const emp = emptiesByType.get(emptiesType.toLowerCase());
      if (!emp) continue;
      const expected = expectedByType.get(emptiesType.toLowerCase()) ?? 0;
      const sold = soldByType.get(emptiesType.toLowerCase()) ?? 0;
      const os = Math.max(0, expected - sold - received);
      receiveLines.push({
        organization_id: orgId,
        empties_receive_id: "",
        product_id: emp.id,
        product_code_snapshot: emp.code,
        product_name_snapshot: emp.name,
        sold_qty: sold,
        owed_qty: 0,
        expected_qty: expected,
        received_qty: received,
        os_qty: os,
        row_no: rowNo++,
      });
      stockDelta.set(emp.id, (stockDelta.get(emp.id) ?? 0) + received);
    }

    if (receiveLines.length > 0) {
      const totalReceived = receiveLines.reduce((s, l) => s + l.received_qty, 0);
      const totalOs = receiveLines.reduce((s, l) => s + l.os_qty, 0);
      const { data: er, error: erErr } = await supabase
        .from("empties_receives")
        .insert({
          organization_id: orgId,
          receive_no: receiveNo,
          empties_receipt_no: invoiceNo,
          customer_id: customerId,
          location_id: locationId,
          receive_date: saleDate,
          notes: `POS: ${invoiceNo}`,
          total_items: receiveLines.length,
          total_received_qty: totalReceived,
          total_os_qty: totalOs,
          status: "saved",
        })
        .select("id")
        .single();

      if (!erErr && er) {
        const receiveId = (er as { id: string }).id;
        const rowsToInsert = receiveLines.map((l) => ({
          ...l,
          empties_receive_id: receiveId,
        }));
        const { error: linesErr } = await supabase.from("empties_receive_lines").insert(rowsToInsert);

        if (!linesErr) {
          for (const [productId, delta] of stockDelta) {
            const { data: prod } = await supabase
              .from("products")
              .select("stock_quantity")
              .eq("id", productId)
              .eq("organization_id", orgId)
              .single();
            const curr = n((prod as { stock_quantity?: number } | null)?.stock_quantity);
            await supabase
              .from("products")
              .update({ stock_quantity: Math.max(0, curr + delta) })
              .eq("id", productId)
              .eq("organization_id", orgId);
          }
        }
      }
    }
  }

  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/pos/receipts");
  revalidatePath("/dashboard/pos/daily-payments");
  revalidatePath("/dashboard/sales/empties-receive");
  revalidatePath("/dashboard/sales/customer-empties-statement");

  return {
    ok: true,
    invoice_id: invoiceId,
    invoice_no: invoiceNo,
  };
}

export type ReceiptRow = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  customer_name: string;
  grand_total: number;
  location_name: string;
  sales_rep_name: string;
  refunded_at: string | null;
};

export async function searchPosReceipts(
  fromDate: string,
  toDate: string,
  query?: string
): Promise<{ receipts?: ReceiptRow[]; error?: string }> {
  const { supabase, orgId, error: ctxError } = await getPosOrgContext();
  if (ctxError || !orgId) return { error: ctxError ?? "No organization" };

  const { data, error } = await supabase
    .from("sales_invoices")
    .select(
      "id, invoice_no, invoice_date, grand_total, refunded_at, customers(name), locations(name), sales_reps(name)"
    )
    .eq("organization_id", orgId)
    .eq("type_status", "pos")
    .gte("invoice_date", fromDate)
    .lte("invoice_date", toDate)
    .order("invoice_date", { ascending: false })
    .order("invoice_no", { ascending: false })
    .limit(200);

  if (error) return { error: error.message };

  const rawData = (data ?? []) as Array<{
    id: string;
    invoice_no: string;
    invoice_date: string;
    grand_total: number;
    refunded_at?: string | null;
    customers?: { name?: string } | { name?: string }[] | null;
    locations?: { name?: string } | { name?: string }[] | null;
    sales_reps?: { name?: string } | { name?: string }[] | null;
  }>;
  let rows: ReceiptRow[] = rawData.map((r) => {
    const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    const loc = Array.isArray(r.locations) ? r.locations[0] : r.locations;
    const rep = Array.isArray(r.sales_reps) ? r.sales_reps[0] : r.sales_reps;
    return {
      id: r.id,
      invoice_no: r.invoice_no,
      invoice_date: r.invoice_date,
      customer_name: cust?.name ?? "Walk-in",
      grand_total: n(r.grand_total),
      location_name: loc?.name ?? "—",
      sales_rep_name: rep?.name ?? "—",
      refunded_at: r.refunded_at ?? null,
    };
  });

  if (query?.trim()) {
    const qq = query.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.invoice_no.toLowerCase().includes(qq) ||
        r.customer_name.toLowerCase().includes(qq) ||
        r.sales_rep_name.toLowerCase().includes(qq)
    );
  }

  return { receipts: rows };
}

export async function refundPosReceipt(invoiceId: string): Promise<{ error?: string }> {
  const { supabase, orgId, error } = await getPosOrgContext();
  if (error || !orgId) return { error: error ?? "No organization" };

  const { data: inv } = await supabase
    .from("sales_invoices")
    .select("id, organization_id, type_status, refunded_at")
    .eq("id", invoiceId)
    .single();

  if (!inv || (inv as { organization_id?: string }).organization_id !== orgId)
    return { error: "Receipt not found" };
  if ((inv as { type_status?: string }).type_status !== "pos")
    return { error: "Not a POS receipt" };
  if ((inv as { refunded_at?: string | null }).refunded_at)
    return { error: "Receipt already refunded" };

  const { data: lines } = await supabase
    .from("sales_invoice_lines")
    .select("id, qty, cl_qty")
    .eq("sales_invoice_id", invoiceId);

  const now = new Date().toISOString();
  await supabase
    .from("sales_invoices")
    .update({ refunded_at: now })
    .eq("id", invoiceId)
    .eq("organization_id", orgId);

  for (const ln of lines ?? []) {
    const l = ln as { id: string; qty?: number; cl_qty?: number };
    await supabase
      .from("sales_invoice_lines")
      .update({
        refunded_qty: n(l.qty),
        refunded_cl_qty: n(l.cl_qty),
      })
      .eq("id", l.id)
      .eq("organization_id", orgId);
  }

  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/pos/receipts");
  revalidatePath("/dashboard/pos/daily-payments");
  return {};
}

export async function refundPosReceiptLine(
  lineId: string
): Promise<{ error?: string }> {
  const { supabase, orgId, error } = await getPosOrgContext();
  if (error || !orgId) return { error: error ?? "No organization" };

  const { data: line } = await supabase
    .from("sales_invoice_lines")
    .select("id, sales_invoice_id, organization_id, qty, cl_qty, refunded_qty, refunded_cl_qty")
    .eq("id", lineId)
    .single();

  if (!line || (line as { organization_id?: string }).organization_id !== orgId)
    return { error: "Line not found" };

  const l = line as {
    sales_invoice_id: string;
    qty?: number;
    cl_qty?: number;
    refunded_qty?: number;
    refunded_cl_qty?: number;
  };
  const qty = n(l.qty);
  const clQty = n(l.cl_qty);
  const alreadyRefundedQty = n(l.refunded_qty);
  const alreadyRefundedClQty = n(l.refunded_cl_qty);
  if (alreadyRefundedQty >= qty && alreadyRefundedClQty >= clQty)
    return { error: "Line already fully refunded" };

  const { error: updErr } = await supabase
    .from("sales_invoice_lines")
    .update({ refunded_qty: qty, refunded_cl_qty: clQty })
    .eq("id", lineId)
    .eq("organization_id", orgId);

  if (updErr) return { error: updErr.message };

  const { data: inv } = await supabase
    .from("sales_invoices")
    .select("id, refunded_at")
    .eq("id", l.sales_invoice_id)
    .eq("organization_id", orgId)
    .single();

  if ((inv as { refunded_at?: string | null })?.refunded_at) {
    revalidatePath("/dashboard/pos");
    revalidatePath("/dashboard/pos/receipts");
    revalidatePath("/dashboard/pos/daily-payments");
    return {};
  }

  const { data: allLines } = await supabase
    .from("sales_invoice_lines")
    .select("qty, cl_qty, refunded_qty, refunded_cl_qty")
    .eq("sales_invoice_id", l.sales_invoice_id);

  const allFullyRefunded = (allLines ?? []).every((ln) => {
    const x = ln as { qty?: number; cl_qty?: number; refunded_qty?: number; refunded_cl_qty?: number };
    return n(x.refunded_qty) >= n(x.qty) && n(x.refunded_cl_qty) >= n(x.cl_qty);
  });

  if (allFullyRefunded) {
    await supabase
      .from("sales_invoices")
      .update({ refunded_at: new Date().toISOString() })
      .eq("id", l.sales_invoice_id)
      .eq("organization_id", orgId);
  }

  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/pos/receipts");
  revalidatePath("/dashboard/pos/daily-payments");
  return {};
}

export type DailyPaymentRow = {
  payment_method: string;
  count: number;
  total: number;
};

export async function getDailyPosPayments(
  date: string
): Promise<{ payments?: DailyPaymentRow[]; error?: string }> {
  const { supabase, orgId, error: ctxError } = await getPosOrgContext();
  if (ctxError || !orgId) return { error: ctxError ?? "No organization" };

  const { data, error } = await supabase
    .from("sales_invoices")
    .select("id, payment_method, grand_total")
    .eq("organization_id", orgId)
    .eq("type_status", "pos")
    .eq("invoice_date", date);

  if (error) return { error: error.message };

  const byMethod = new Map<string, { count: number; total: number }>();
  for (const row of data ?? []) {
    const method = (row as { payment_method?: string }).payment_method ?? "cash";
    const total = n((row as { grand_total?: number }).grand_total);
    const curr = byMethod.get(method) ?? { count: 0, total: 0 };
    curr.count += 1;
    curr.total += total;
    byMethod.set(method, curr);
  }

  const payments: DailyPaymentRow[] = Array.from(byMethod.entries())
    .map(([payment_method, { count, total }]) => ({ payment_method, count, total }))
    .sort((a, b) => b.total - a.total);

  return { payments };
}

export type DailyPaymentAccountRow = {
  accountId: string | null;
  code: string;
  accountName: string;
  type: string;
  head: string;
  balance: number;
  dayTotal: number;
  txnCount: number;
  transactions: Array<{
    id: string;
    invoice_no: string;
    grand_total: number;
    location_name: string;
    customer_name: string;
  }>;
};

export async function getDailyPosPaymentsByAccount(
  date: string,
  locationId?: string | null,
  search?: string | null
): Promise<{
  accounts?: DailyPaymentAccountRow[];
  totalCollected?: number;
  totalReceipts?: number;
  error?: string;
}> {
  const { supabase, orgId, error: ctxError } = await getPosOrgContext();
  if (ctxError || !orgId) return { error: ctxError ?? "No organization" };

  const [accountsRes, invoicesRes] = await Promise.all([
    supabase
      .from("payment_accounts")
      .select("id, code, name, account_type")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("sales_invoices")
      .select(
        "id, invoice_no, grand_total, payment_account_id, location_id, customers(name), locations(name)"
      )
      .eq("organization_id", orgId)
      .eq("type_status", "pos")
      .eq("invoice_date", date)
      .order("invoice_no"),
  ]);

  if (accountsRes.error) return { error: accountsRes.error.message };
  if (invoicesRes.error) return { error: invoicesRes.error.message };

  const accounts = (accountsRes.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    account_type: string;
  }>;

  const invoices = (invoicesRes.data ?? []) as Array<{
    id: string;
    invoice_no: string;
    grand_total: number;
    payment_account_id: string | null;
    location_id: string | null;
    customers?: { name?: string } | { name?: string }[] | null;
    locations?: { name?: string } | { name?: string }[] | null;
  }>;

  const searchQ = String(search ?? "").trim().toLowerCase();
  const accountMatchesSearch = (code: string, name: string) => {
    if (!searchQ) return true;
    return (
      code.toLowerCase().includes(searchQ) ||
      name.toLowerCase().includes(searchQ)
    );
  };

  const typeToHead: Record<string, string> = {
    cash: "Cash on Hand",
    bank: "Bank Accounts",
    momo: "Momo Accounts",
  };
  const typeLabel: Record<string, string> = {
    cash: "Cash",
    bank: "Bank",
    momo: "Momo",
  };

  const byAccount = new Map<
    string | null,
    {
      code: string;
      accountName: string;
      type: string;
      head: string;
      balance: number;
      transactions: DailyPaymentAccountRow["transactions"];
    }
  >();

  for (const acc of accounts) {
    if (!accountMatchesSearch(acc.code, acc.name)) continue;
    const head = typeToHead[acc.account_type?.toLowerCase() ?? ""] ?? "Other";
    const type = typeLabel[acc.account_type?.toLowerCase() ?? ""] ?? acc.account_type;
    byAccount.set(acc.id, {
      code: acc.code,
      accountName: acc.name,
      type,
      head,
      balance: 0,
      transactions: [],
    });
  }

  byAccount.set(null, {
    code: "—",
    accountName: "Unallocated",
    type: "—",
    head: "Other",
    balance: 0,
    transactions: [],
  });

  let totalCollected = 0;
  let totalReceipts = 0;

  for (const inv of invoices) {
    const locId = inv.location_id;
    if (locationId && String(locId ?? "") !== String(locationId)) continue;

    const total = n(inv.grand_total);
    totalCollected += total;
    totalReceipts += 1;

    const accId = inv.payment_account_id ?? null;
    let entry = byAccount.get(accId);
    if (!entry && accId) {
      const acc = accounts.find((a) => a.id === accId);
      if (acc && accountMatchesSearch(acc.code, acc.name)) {
        entry = {
          code: acc.code,
          accountName: acc.name,
          type: typeLabel[acc.account_type?.toLowerCase() ?? ""] ?? acc.account_type,
          head: typeToHead[acc.account_type?.toLowerCase() ?? ""] ?? "Other",
          balance: 0,
          transactions: [],
        };
        byAccount.set(accId, entry);
      }
    }
    if (!entry) entry = byAccount.get(null)!;

    const cust = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
    const loc = Array.isArray(inv.locations) ? inv.locations[0] : inv.locations;
    entry.transactions.push({
      id: inv.id,
      invoice_no: inv.invoice_no,
      grand_total: total,
      location_name: loc?.name ?? "—",
      customer_name: cust?.name ?? "Walk-in",
    });
  }

  const rows: DailyPaymentAccountRow[] = [];
  for (const [accId, entry] of byAccount.entries()) {
    const dayTotal = entry.transactions.reduce((s, t) => s + t.grand_total, 0);
    if (dayTotal === 0 && entry.accountName === "Unallocated") continue;
    rows.push({
      accountId: accId,
      code: entry.code,
      accountName: entry.accountName,
      type: entry.type,
      head: entry.head,
      balance: entry.balance,
      dayTotal,
      txnCount: entry.transactions.length,
      transactions: entry.transactions,
    });
  }

  rows.sort((a, b) => {
    const headOrder = ["Cash on Hand", "Momo Accounts", "Bank Accounts", "Other"];
    const aIdx = headOrder.indexOf(a.head);
    const bIdx = headOrder.indexOf(b.head);
    if (aIdx !== bIdx) return aIdx - bIdx;
    return b.dayTotal - a.dayTotal;
  });

  return {
    accounts: rows,
    totalCollected,
    totalReceipts,
  };
}
