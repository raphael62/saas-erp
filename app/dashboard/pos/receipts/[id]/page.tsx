import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReceiptPrintPage } from "./ReceiptPrintPage";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: inv } = await supabase
    .from("sales_invoices")
    .select(
      `
      id, invoice_no, invoice_date, grand_total, sub_total, tax_total, empties_value, refunded_at, organization_id, cashier_id,
      customers(name),
      locations(name, phone),
      sales_reps(name)
    `
    )
    .eq("id", id)
    .eq("type_status", "pos")
    .single();

  if (!inv) notFound();

  const refundedAt = (inv as { refunded_at?: string | null }).refunded_at ?? null;

  let orgName = "";
  let orgPhone = "";
  let cashierName = "—";
  const orgId = (inv as { organization_id?: string }).organization_id;
  const cashierId = (inv as { cashier_id?: string }).cashier_id;
  if (orgId) {
    const { data: org } = await supabase
      .from("organizations")
      .select("name, phone")
      .eq("id", orgId)
      .single();
    orgName = (org as { name?: string } | null)?.name ?? "";
    orgPhone = (org as { phone?: string } | null)?.phone ?? "";
  }
  if (cashierId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", cashierId)
      .single();
    cashierName = (prof as { full_name?: string } | null)?.full_name ?? "—";
  }

  const { data: lines } = await supabase
    .from("sales_invoice_lines")
    .select("id, item_name_snapshot, pack_unit, qty, cl_qty, refunded_qty, refunded_cl_qty, price_tax_inc, value_tax_inc")
    .eq("sales_invoice_id", id)
    .order("row_no");

  const loc = inv.locations as { name?: string; phone?: string } | null;
  const cust = inv.customers as { name?: string } | null;
  const rep = inv.sales_reps as { name?: string } | null;

  const n = (v: unknown) => {
    const raw = String(v ?? "").replace(/,/g, "").trim();
    return raw ? (Number(raw) || 0) : 0;
  };

  const receiptLines = (lines ?? [])
    .filter((l: { item_name_snapshot?: string }) => !String(l.item_name_snapshot ?? "").toLowerCase().includes("empties"))
    .map((l: {
      id?: string;
      item_name_snapshot?: string;
      pack_unit?: number;
      qty?: number;
      cl_qty?: number;
      refunded_qty?: number;
      refunded_cl_qty?: number;
      price_tax_inc?: number;
      value_tax_inc?: number;
    }) => {
      const pack = Number(l.pack_unit ?? 0);
      const qtyBtl = Number(l.qty ?? 0);
      const qtyCtn = Number(l.cl_qty ?? 0);
      const price = Number(l.price_tax_inc ?? 0);
      const amount = Number(l.value_tax_inc ?? 0);
      const unit = qtyBtl > 0 && pack > 0 ? "Btl" : "Ctn";
      const qty = qtyBtl > 0 ? qtyBtl : qtyCtn;
      const refundedQty = n(l.refunded_qty);
      const refundedClQty = n(l.refunded_cl_qty);
      const isFullyRefunded = refundedQty >= qtyBtl && refundedClQty >= qtyCtn;
      return {
        lineId: l.id ?? "",
        item: l.item_name_snapshot ?? "—",
        unit,
        qty,
        price,
        amount,
        isFullyRefunded,
      };
    });

  const subTotal = Number(inv.sub_total ?? 0);
  const vat = Number(inv.tax_total ?? 0);
  const total = Number(inv.grand_total ?? 0);
  const emptiesVal = Number(inv.empties_value ?? 0);

  const invDate = String(inv.invoice_date ?? "");
  const dateObj = invDate ? new Date(invDate + "T12:00:00") : new Date();
  const dateStr =
    dateObj.getDate().toString().padStart(2, "0") +
    "-" +
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dateObj.getMonth()] +
    "-" +
    dateObj.getFullYear().toString().slice(-2);

  const data = {
    companyName: orgName || "Company",
    locationName: loc?.name ?? "—",
    locationPhone: loc?.phone,
    orgPhone: orgPhone || undefined,
    invNo: inv.invoice_no,
    cashier: cashierName,
    salesRep: rep?.name ?? "—",
    customerName: cust?.name ?? "Walk-in",
    date: dateStr,
    time: "",
    lines: receiptLines.map(({ lineId, isFullyRefunded, ...rest }) => rest),
    netTotal: subTotal,
    vatRate: subTotal > 0 ? (vat / subTotal) * 100 : 0,
    vatAmount: vat,
    total: total - emptiesVal,
    emptiesDeposit: emptiesVal,
    grandTotal: total,
    amountPaid: total,
    change: 0,
    emptiesReceived: [] as Array<{ emptiesType: string; qtyCtn: number }>,
  };

  return (
    <ReceiptPrintPage
      data={data}
      invoiceId={id}
      refundedAt={refundedAt}
      receiptLines={receiptLines}
    />
  );
}
