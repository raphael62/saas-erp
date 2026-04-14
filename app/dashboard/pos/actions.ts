"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { gateModulePageAction } from "@/lib/mutation-gate";
import { reassignInventoryDeltaFromDefaultLocation } from "@/lib/inventory-location-balances";
import { getUserTransactionScope, scopeAllowsInvoiceRow } from "@/lib/user-transaction-scope";
import {
  getPaymentAccountAccessForUser,
  userHasShopSalesRepRole,
  assertPaymentAccountIdAllowed,
} from "@/lib/payment-account-access";
import { userHasCashierRole } from "@/lib/pos-staff-roles";
import { deletePosParkedCartAfterSuccessfulSale } from "@/app/dashboard/pos/parked-actions";
import {
  addCalendarDays,
  type PosLineRefundRow,
  posCashRefundOut,
  posCollectedAtSale,
  posMerchRefundFromLines,
  posRefundBookDate,
} from "@/lib/pos-cash-movements";
import { computePromoRewardCartonsByPromotionId } from "@/lib/pos-promo-cartons";
import { computePosStockDeductionsByProduct } from "@/lib/pos-inventory-deductions";

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
  /** Shop reps must use on_account; others default paid_in_full at POS. */
  saleSettlement?: "paid_in_full" | "on_account";
  /** When completing a sale that was loaded from this server parked cart, promo reservations are released first. */
  completedFromParkedCartId?: string | null;
};

function isEmptiesProduct(itemName: string): boolean {
  return String(itemName ?? "").toLowerCase().includes("empties");
}

function isPromoLine(line: PosSaleLineInput): boolean {
  return Boolean(
    String(line.item_name ?? "").startsWith("Free - ") || line.isPromo
  );
}

/** yyyymmdd + daily sequence (e.g. 20260414001). */
function formatPosDaySeq(seq: number): string {
  if (!Number.isFinite(seq) || seq < 1) return "001";
  if (seq < 1000) return String(seq).padStart(3, "0");
  return String(seq);
}

async function generatePosInvoiceNo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  saleDate: string
): Promise<string> {
  let dateCompact = saleDate.replace(/-/g, "").slice(0, 8);
  if (dateCompact.length !== 8 || !/^\d{8}$/.test(dateCompact)) {
    dateCompact = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  }
  const prefix = dateCompact;
  const { data: seqRaw, error } = await supabase.rpc("next_sales_invoice_seq_for_prefix", {
    p_organization_id: orgId,
    p_prefix: prefix,
  });
  if (error) {
    const { data: rows } = await supabase
      .from("sales_invoices")
      .select("invoice_no")
      .eq("organization_id", orgId)
      .eq("type_status", "pos")
      .like("invoice_no", `${prefix}%`);
    let maxSeq = 0;
    for (const row of (rows ?? []) as { invoice_no?: string }[]) {
      const no = String(row.invoice_no ?? "");
      if (no.startsWith(prefix) && no.length > prefix.length) {
        const suffix = no.slice(prefix.length);
        if (/^\d+$/.test(suffix)) {
          const parsed = parseInt(suffix, 10);
          if (Number.isFinite(parsed)) maxSeq = Math.max(maxSeq, parsed);
        }
      }
    }
    return `${dateCompact}${formatPosDaySeq(maxSeq + 1)}`;
  }
  const seq = typeof seqRaw === "number" && Number.isFinite(seqRaw) ? seqRaw : 1;
  return `${dateCompact}${formatPosDaySeq(seq)}`;
}

export async function savePosSale(input: PosSaleInput) {
  const gate = await gateModulePageAction("pos", "new-sale", "create");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId, userId } = gate;

  const customerId = input.customerId?.trim() || null;
  const locationId = input.locationId?.trim() || null;
  const salesRepId = input.salesRepId?.trim() || null;
  if (!salesRepId) return { error: "Sales Rep is required" };
  if (!customerId) return { error: "Customer is required" };

  const { data: customerRow, error: custErr } = await supabase
    .from("customers")
    .select("id, sales_rep_id")
    .eq("id", customerId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (custErr || !customerRow) return { error: "Invalid customer" };
  const custRep = String((customerRow as { sales_rep_id?: string | null }).sales_rep_id ?? "").trim();
  if (custRep !== salesRepId) {
    return { error: "Customer does not belong to the selected sales rep." };
  }

  const scope = await getUserTransactionScope(supabase, userId, orgId);
  if (!scopeAllowsInvoiceRow(scope, locationId, salesRepId)) {
    return { error: "You are not allowed to use this location or sales rep for this sale." };
  }

  const saleDate = String(input.saleDate ?? "").slice(0, 10);
  if (!saleDate) return { error: "Sale date is required" };

  const invoiceNo = await generatePosInvoiceNo(supabase, orgId, saleDate);

  const subTotal = n(input.subTotal);
  const vatTotal = n(input.vatTotal);
  const grandTotal = n(input.grandTotal);
  const emptiesDeposit = n(input.emptiesDeposit);
  const grandTotalWithEmpties = grandTotal + emptiesDeposit;

  const shopRep = await userHasShopSalesRepRole(supabase, userId, orgId);
  const payAccess = await getPaymentAccountAccessForUser(supabase, userId, orgId);
  const wantsOnAccount = input.saleSettlement === "on_account";

  if (shopRep) {
    if (!wantsOnAccount) {
      return {
        error:
          "Shop sales reps can only complete POS sales on account (payments are not available).",
      };
    }
    if (input.paymentAccountId?.trim() || n(input.amountPaid) > 0) {
      return { error: "Shop sales reps cannot take payments at POS." };
    }
  }

  const onAccountSale = shopRep || wantsOnAccount;
  let balanceOs = 0;
  let paymentMethodOut = String(input.paymentMethod ?? "cash").trim() || "cash";
  let paymentAccountIdOut: string | null = input.paymentAccountId?.trim() || null;

  if (onAccountSale) {
    balanceOs = grandTotalWithEmpties;
    paymentMethodOut = "On account";
    paymentAccountIdOut = null;
  } else {
    if (!payAccess.unrestricted && payAccess.allowedIds.size === 0) {
      return {
        error:
          "No payment accounts are assigned to you. Ask an administrator to assign accounts in user settings.",
      };
    }
    const acctCheck = assertPaymentAccountIdAllowed(payAccess, paymentAccountIdOut);
    if (!acctCheck.ok) return { error: acctCheck.error };
  }

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
      balance_os: balanceOs,
      total_qty: 0,
      sub_total: subTotal,
      tax_total: vatTotal,
      grand_total: grandTotalWithEmpties,
      empties_value: emptiesDeposit,
      payment_method: paymentMethodOut,
      payment_account_id: paymentAccountIdOut,
      cashier_id: input.cashierId?.trim() || userId,
      posted_at: new Date().toISOString(),
      posted_by: userId,
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

  const parkedCompleteId = String(input.completedFromParkedCartId ?? "").trim();

  // Inventory: skip when completing from a server parked cart (stock was deducted at park time).
  if (!parkedCompleteId) {
    const productDeductions = computePosStockDeductionsByProduct(lines);
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

      if (locationId) {
        const loc = await reassignInventoryDeltaFromDefaultLocation(
          supabase,
          orgId,
          productId,
          -deductQty,
          locationId
        );
        if (loc.error) return { error: loc.error };
      }
    }
  }

  // Promo consumption: release parked reservations for this cart, then update promotions.consumed_cartons
  if (parkedCompleteId) {
    const { error: relErr } = await supabase
      .from("pos_parked_promo_reservations")
      .delete()
      .eq("organization_id", orgId)
      .eq("pos_parked_cart_id", parkedCompleteId);
    if (relErr && !relErr.message.toLowerCase().includes("does not exist")) {
      return { error: relErr.message };
    }
    const { error: invRelErr } = await supabase
      .from("pos_parked_inventory_reservations")
      .delete()
      .eq("organization_id", orgId)
      .eq("pos_parked_cart_id", parkedCompleteId);
    if (invRelErr && !invRelErr.message.toLowerCase().includes("does not exist")) {
      return { error: invRelErr.message };
    }
  }

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

  const promoCartonsByPromoId = computePromoRewardCartonsByPromotionId(lines, rules);

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
            if (locationId && delta) {
              const loc = await reassignInventoryDeltaFromDefaultLocation(
                supabase,
                orgId,
                productId,
                delta,
                locationId
              );
              if (loc.error) return { error: loc.error };
            }
          }
        }
      }
    }
  }

  const parkedSaleCleanupId = String(input.completedFromParkedCartId ?? "").trim();
  if (parkedSaleCleanupId) {
    const cleanup = await deletePosParkedCartAfterSuccessfulSale(supabase, orgId, parkedSaleCleanupId);
    if (cleanup.error) {
      console.warn("[savePosSale] parked cart cleanup:", cleanup.error);
    }
  }

  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/pos/receipts");
  revalidatePath("/dashboard/pos/daily-payments");
  revalidatePath("/dashboard/sales/empties-receive");
  revalidatePath("/dashboard/sales/customer-empties-statement");
  revalidatePath("/dashboard/inventory/stocks-by-location");
  revalidatePath("/dashboard/inventory");

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
  const gate = await gateModulePageAction("pos", "receipts", "view");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId, userId } = gate;

  const scope = await getUserTransactionScope(supabase, userId, orgId);

  let invQuery = supabase
    .from("sales_invoices")
    .select(
      "id, invoice_no, invoice_date, grand_total, refunded_at, customers(name), locations(name), sales_reps(name)"
    )
    .eq("organization_id", orgId)
    .eq("type_status", "pos")
    .gte("invoice_date", fromDate)
    .lte("invoice_date", toDate);

  if (!scope.unrestricted && scope.restrictByRep && scope.linkedSalesRepId) {
    invQuery = invQuery.eq("sales_rep_id", scope.linkedSalesRepId);
  }

  const { data, error } = await invQuery
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
  const gate = await gateModulePageAction("pos", "receipts", "edit");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId, userId } = gate;
  if (await userHasCashierRole(supabase, userId, orgId)) {
    return { error: "Cashiers cannot process refunds." };
  }

  const { data: inv } = await supabase
    .from("sales_invoices")
    .select("id, organization_id, type_status, refunded_at, location_id, sales_rep_id")
    .eq("id", invoiceId)
    .single();

  if (!inv || (inv as { organization_id?: string }).organization_id !== orgId)
    return { error: "Receipt not found" };
  if ((inv as { type_status?: string }).type_status !== "pos")
    return { error: "Not a POS receipt" };
  if ((inv as { refunded_at?: string | null }).refunded_at)
    return { error: "Receipt already refunded" };

  const scope = await getUserTransactionScope(supabase, userId, orgId);
  const locId = String((inv as { location_id?: string | null }).location_id ?? "").trim() || null;
  const repId = String((inv as { sales_rep_id?: string | null }).sales_rep_id ?? "").trim() || null;
  if (!scopeAllowsInvoiceRow(scope, locId, repId)) {
    return { error: "You are not allowed to refund this receipt." };
  }

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
  const gate = await gateModulePageAction("pos", "receipts", "edit");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId, userId } = gate;
  if (await userHasCashierRole(supabase, userId, orgId)) {
    return { error: "Cashiers cannot process refunds." };
  }

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

  const { data: invScopeRow } = await supabase
    .from("sales_invoices")
    .select("location_id, sales_rep_id")
    .eq("id", l.sales_invoice_id)
    .eq("organization_id", orgId)
    .maybeSingle();
  const scope = await getUserTransactionScope(supabase, userId, orgId);
  const invLoc = String((invScopeRow as { location_id?: string | null } | null)?.location_id ?? "").trim() || null;
  const invRep = String((invScopeRow as { sales_rep_id?: string | null } | null)?.sales_rep_id ?? "").trim() || null;
  if (!scopeAllowsInvoiceRow(scope, invLoc, invRep)) {
    return { error: "You are not allowed to refund this receipt line." };
  }

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
  const gate = await gateModulePageAction("pos", "daily-payments", "view");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId, userId } = gate;
  const payAccess = await getPaymentAccountAccessForUser(supabase, userId, orgId);
  const scope = await getUserTransactionScope(supabase, userId, orgId);

  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${addCalendarDays(date, 1)}T00:00:00`;

  const [salesRes, hdrRefundRes, lineRefundRes] = await Promise.all([
    supabase
      .from("sales_invoices")
      .select(
        "id, payment_method, grand_total, balance_os, payment_account_id, sales_rep_id, invoice_date, refunded_at"
      )
      .eq("organization_id", orgId)
      .eq("type_status", "pos")
      .eq("invoice_date", date),
    supabase
      .from("sales_invoices")
      .select(
        "id, payment_method, grand_total, balance_os, payment_account_id, sales_rep_id, invoice_date, refunded_at"
      )
      .eq("organization_id", orgId)
      .eq("type_status", "pos")
      .not("payment_account_id", "is", null)
      .not("refunded_at", "is", null)
      .gte("refunded_at", dayStart)
      .lt("refunded_at", dayEnd),
    supabase
      .from("sales_invoice_lines")
      .select("sales_invoice_id")
      .eq("organization_id", orgId)
      .or("refunded_qty.gt.0,refunded_cl_qty.gt.0")
      .gte("updated_at", dayStart)
      .lt("updated_at", dayEnd),
  ]);

  if (salesRes.error) return { error: salesRes.error.message };
  if (hdrRefundRes.error) return { error: hdrRefundRes.error.message };
  if (lineRefundRes.error) return { error: lineRefundRes.error.message };

  type InvRow = {
    id: string;
    payment_method?: string | null;
    grand_total?: number;
    balance_os?: number;
    payment_account_id?: string | null;
    sales_rep_id?: string | null;
    invoice_date?: string;
    refunded_at?: string | null;
  };

  const invById = new Map<string, InvRow>();
  for (const row of (salesRes.data ?? []) as InvRow[]) invById.set(row.id, row);
  for (const row of (hdrRefundRes.data ?? []) as InvRow[]) invById.set(row.id, row);

  const lineInvIds = [
    ...new Set(
      (lineRefundRes.data ?? [])
        .map((x) => String((x as { sales_invoice_id?: string }).sales_invoice_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  const missingInv = lineInvIds.filter((id) => !invById.has(id));
  if (missingInv.length > 0) {
    const { data: extraInv, error: exErr } = await supabase
      .from("sales_invoices")
      .select(
        "id, payment_method, grand_total, balance_os, payment_account_id, sales_rep_id, invoice_date, refunded_at"
      )
      .eq("organization_id", orgId)
      .eq("type_status", "pos")
      .in("id", missingInv);
    if (exErr) return { error: exErr.message };
    for (const row of (extraInv ?? []) as InvRow[]) invById.set(row.id, row);
  }

  const allIds = [...invById.keys()];
  const linesByInvoice = new Map<string, PosLineRefundRow[]>();
  if (allIds.length > 0) {
    const { data: lineRows, error: lErr } = await supabase
      .from("sales_invoice_lines")
      .select("sales_invoice_id, qty, cl_qty, refunded_qty, refunded_cl_qty, value_tax_inc, updated_at")
      .eq("organization_id", orgId)
      .in("sales_invoice_id", allIds);
    if (lErr) return { error: lErr.message };
    for (const raw of lineRows ?? []) {
      const ln = raw as PosLineRefundRow & { sales_invoice_id?: string };
      const iid = String(ln.sales_invoice_id ?? "").trim();
      if (!iid) continue;
      const arr = linesByInvoice.get(iid) ?? [];
      arr.push(ln);
      linesByInvoice.set(iid, arr);
    }
  }

  const passesScopeAndPay = (row: InvRow) => {
    if (!scope.unrestricted && scope.restrictByRep && scope.linkedSalesRepId) {
      const rid = String(row.sales_rep_id ?? "").trim();
      if (rid !== scope.linkedSalesRepId) return false;
    }
    if (!payAccess.unrestricted) {
      const pid = row.payment_account_id;
      if (!pid || !payAccess.allowedIds.has(pid)) return false;
    }
    return true;
  };

  const byMethod = new Map<string, { count: number; total: number }>();
  const bump = (method: string, totalDelta: number, saleReceipt: boolean) => {
    const m = method || "cash";
    const cur = byMethod.get(m) ?? { count: 0, total: 0 };
    cur.total += totalDelta;
    if (saleReceipt) cur.count += 1;
    byMethod.set(m, cur);
  };

  for (const row of (salesRes.data ?? []) as InvRow[]) {
    if (!passesScopeAndPay(row)) continue;
    const collected = posCollectedAtSale(row.grand_total, row.balance_os);
    if (collected <= 0) continue;
    bump(String(row.payment_method ?? "cash"), collected, true);
  }

  for (const inv of invById.values()) {
    if (!passesScopeAndPay(inv)) continue;
    const saleD = String(inv.invoice_date ?? "").slice(0, 10);
    if (!saleD) continue;
    const collected = posCollectedAtSale(inv.grand_total, inv.balance_os);
    const { merchRefund, lastRefundLineTs } = posMerchRefundFromLines(linesByInvoice.get(inv.id) ?? []);
    const refundCash = posCashRefundOut(collected, merchRefund);
    const refundD = refundCash > 0 ? posRefundBookDate(saleD, inv.refunded_at, lastRefundLineTs) : "";
    if (refundCash > 0 && refundD === date) {
      bump(String(inv.payment_method ?? "cash"), -refundCash, false);
    }
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
    /** Sale: cash collected; refund: negative cash out */
    amount: number;
    txn_kind: "sale" | "refund";
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
  const gate = await gateModulePageAction("pos", "daily-payments", "view");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId, userId } = gate;
  const payAccess = await getPaymentAccountAccessForUser(supabase, userId, orgId);
  const scope = await getUserTransactionScope(supabase, userId, orgId);

  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${addCalendarDays(date, 1)}T00:00:00`;

  const selectInv =
    "id, invoice_no, grand_total, balance_os, payment_account_id, location_id, sales_rep_id, invoice_date, refunded_at, customers(name), locations(name)";

  const [accountsRes, salesRes, hdrRefundRes, lineRefundRes] = await Promise.all([
    supabase
      .from("payment_accounts")
      .select("id, code, name, account_type")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("sales_invoices")
      .select(selectInv)
      .eq("organization_id", orgId)
      .eq("type_status", "pos")
      .eq("invoice_date", date)
      .order("invoice_no"),
    supabase
      .from("sales_invoices")
      .select(selectInv)
      .eq("organization_id", orgId)
      .eq("type_status", "pos")
      .not("payment_account_id", "is", null)
      .not("refunded_at", "is", null)
      .gte("refunded_at", dayStart)
      .lt("refunded_at", dayEnd),
    supabase
      .from("sales_invoice_lines")
      .select("sales_invoice_id")
      .eq("organization_id", orgId)
      .or("refunded_qty.gt.0,refunded_cl_qty.gt.0")
      .gte("updated_at", dayStart)
      .lt("updated_at", dayEnd),
  ]);

  if (accountsRes.error) return { error: accountsRes.error.message };
  if (salesRes.error) return { error: salesRes.error.message };
  if (hdrRefundRes.error) return { error: hdrRefundRes.error.message };
  if (lineRefundRes.error) return { error: lineRefundRes.error.message };

  const accounts = (accountsRes.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    account_type: string;
  }>;

  type InvAcc = {
    id: string;
    invoice_no: string;
    grand_total: number;
    balance_os?: number;
    payment_account_id: string | null;
    location_id: string | null;
    sales_rep_id?: string | null;
    invoice_date?: string;
    refunded_at?: string | null;
    customers?: { name?: string } | { name?: string }[] | null;
    locations?: { name?: string } | { name?: string }[] | null;
  };

  const invById = new Map<string, InvAcc>();
  for (const row of (salesRes.data ?? []) as InvAcc[]) invById.set(row.id, row);
  for (const row of (hdrRefundRes.data ?? []) as InvAcc[]) invById.set(row.id, row);

  const lineInvIds = [
    ...new Set(
      (lineRefundRes.data ?? [])
        .map((x) => String((x as { sales_invoice_id?: string }).sales_invoice_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  const missingInv = lineInvIds.filter((id) => !invById.has(id));
  if (missingInv.length > 0) {
    const { data: extraInv, error: exErr } = await supabase
      .from("sales_invoices")
      .select(selectInv)
      .eq("organization_id", orgId)
      .eq("type_status", "pos")
      .in("id", missingInv);
    if (exErr) return { error: exErr.message };
    for (const row of (extraInv ?? []) as InvAcc[]) invById.set(row.id, row);
  }

  const allIds = [...invById.keys()];
  const linesByInvoice = new Map<string, PosLineRefundRow[]>();
  if (allIds.length > 0) {
    const { data: lineRows, error: lErr } = await supabase
      .from("sales_invoice_lines")
      .select("sales_invoice_id, qty, cl_qty, refunded_qty, refunded_cl_qty, value_tax_inc, updated_at")
      .eq("organization_id", orgId)
      .in("sales_invoice_id", allIds);
    if (lErr) return { error: lErr.message };
    for (const raw of lineRows ?? []) {
      const ln = raw as PosLineRefundRow & { sales_invoice_id?: string };
      const iid = String(ln.sales_invoice_id ?? "").trim();
      if (!iid) continue;
      const arr = linesByInvoice.get(iid) ?? [];
      arr.push(ln);
      linesByInvoice.set(iid, arr);
    }
  }

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
    if (!payAccess.unrestricted && !payAccess.allowedIds.has(acc.id)) continue;
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

  if (payAccess.unrestricted) {
    byAccount.set(null, {
      code: "—",
      accountName: "Unallocated",
      type: "—",
      head: "Other",
      balance: 0,
      transactions: [],
    });
  }

  let totalCollected = 0;
  let totalReceipts = 0;

  const resolveEntry = (accId: string | null) => {
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
    if (!entry) {
      if (payAccess.unrestricted) entry = byAccount.get(null)!;
    }
    return entry ?? null;
  };

  const passesScopeLocPay = (inv: InvAcc) => {
    const locId = inv.location_id;
    if (locationId && String(locId ?? "") !== String(locationId)) return false;
    if (!scope.unrestricted && scope.restrictByRep && scope.linkedSalesRepId) {
      const rid = String(inv.sales_rep_id ?? "").trim();
      if (rid !== scope.linkedSalesRepId) return false;
    }
    const accId = inv.payment_account_id ?? null;
    if (!payAccess.unrestricted) {
      if (!accId || !payAccess.allowedIds.has(accId)) return false;
    }
    return true;
  };

  const pushTxn = (
    inv: InvAcc,
    accId: string | null,
    amount: number,
    txn_kind: "sale" | "refund"
  ) => {
    const entry = resolveEntry(accId);
    if (!entry) return;
    const cust = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
    const loc = Array.isArray(inv.locations) ? inv.locations[0] : inv.locations;
    entry.transactions.push({
      id: txn_kind === "refund" ? `${inv.id}-refund` : inv.id,
      invoice_no: inv.invoice_no,
      amount,
      txn_kind,
      location_name: loc?.name ?? "—",
      customer_name: cust?.name ?? "Walk-in",
    });
    totalCollected += amount;
    if (txn_kind === "sale") totalReceipts += 1;
  };

  for (const inv of (salesRes.data ?? []) as InvAcc[]) {
    if (!passesScopeLocPay(inv)) continue;
    const collected = posCollectedAtSale(inv.grand_total, inv.balance_os);
    if (collected <= 0) continue;
    pushTxn(inv, inv.payment_account_id ?? null, collected, "sale");
  }

  for (const inv of invById.values()) {
    if (!passesScopeLocPay(inv)) continue;
    const saleD = String(inv.invoice_date ?? "").slice(0, 10);
    if (!saleD) continue;
    const collected = posCollectedAtSale(inv.grand_total, inv.balance_os);
    const { merchRefund, lastRefundLineTs } = posMerchRefundFromLines(linesByInvoice.get(inv.id) ?? []);
    const refundCash = posCashRefundOut(collected, merchRefund);
    const refundD = refundCash > 0 ? posRefundBookDate(saleD, inv.refunded_at, lastRefundLineTs) : "";
    if (refundCash > 0 && refundD === date) {
      pushTxn(inv, inv.payment_account_id ?? null, -refundCash, "refund");
    }
  }

  const rows: DailyPaymentAccountRow[] = [];
  for (const [accId, entry] of byAccount.entries()) {
    const dayTotal = entry.transactions.reduce((s, t) => s + t.amount, 0);
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
