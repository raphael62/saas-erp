"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteSalesOrder } from "@/app/dashboard/sales/sales-orders/actions";
import { SalesOrderFormDialog } from "@/components/sales/sales-order-form-dialog";

type Order = {
  id: string;
  order_no: string;
  customer_id?: string | null;
  sales_rep_id?: string | null;
  location_id?: string | null;
  order_date: string;
  delivery_date?: string | null;
  notes?: string | null;
  sub_total?: number | null;
  tax_total?: number | null;
  grand_total?: number | null;
  created_at?: string | null;
  customers?: { id: string; name: string } | null;
  sales_reps?: { id: string; name: string } | null;
  locations?: { id: string; code?: string | null; name: string } | null;
};

type OrderLine = {
  id: string;
  sales_order_id: string;
  product_id?: string | null;
  item_name_snapshot?: string | null;
  price_type?: string | null;
  pack_unit?: number | null;
  qty?: number | null;
  cl_qty?: number | null;
  price_ex?: number | null;
  price_tax_inc?: number | null;
  tax_amount?: number | null;
  value_tax_inc?: number | null;
  row_no?: number | null;
};

const emptyProducts: { id: string | number; code?: string | null; name: string; pack_unit?: number | null }[] = [];
const emptyCustomers: { id: string; tax_id?: string | null; name: string; sales_rep_id?: string | null; price_type?: string | null; location_id?: string | null }[] = [];
const emptyReps: { id: string; code?: string | null; name: string }[] = [];
const emptyLocations: { id: string; code?: string | null; name: string }[] = [];
const emptyPriceTypes: { id: string; code?: string | null; name: string }[] = [];
const emptyPriceLists: { id: string; price_type_id: string; effective_date?: string | null; expiry_date?: string | null; is_active?: boolean | null; price_types?: { name?: string | null } | null }[] = [];
const emptyPriceListItems: { price_list_id: string; product_id: string | number; price?: number | null; tax_rate?: number | null; vat_type?: string | null }[] = [];
const emptyInvoices: { customer_id?: string | null; invoice_date?: string; location_id?: string | null; balance_os?: number | null }[] = [];

function formatMoney(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function SalesOrderList({
  orders = [],
  lines = [],
  products: productsProp = emptyProducts,
  customers: customersProp = emptyCustomers,
  customersError,
  salesReps: salesRepsProp = emptyReps,
  locations: locationsProp = emptyLocations,
  priceTypes: priceTypesProp = emptyPriceTypes,
  priceLists: priceListsProp = emptyPriceLists,
  priceListItems: priceListItemsProp = emptyPriceListItems,
  invoices: invoicesProp = emptyInvoices,
  editId: initialEditId,
}: {
  orders: Order[];
  lines: OrderLine[];
  products?: { id: string | number; code?: string | null; name: string; pack_unit?: number | null }[];
  customers?: { id: string; tax_id?: string | null; name: string; sales_rep_id?: string | null; price_type?: string | null; location_id?: string | null }[];
  customersError?: string | null;
  salesReps?: { id: string; code?: string | null; name: string }[];
  locations?: { id: string; code?: string | null; name: string }[];
  priceTypes?: { id: string; code?: string | null; name: string }[];
  priceLists?: { id: string; price_type_id: string; effective_date?: string | null; expiry_date?: string | null; is_active?: boolean | null; price_types?: { name?: string | null } | null }[];
  priceListItems?: { price_list_id: string; product_id: string | number; price?: number | null; tax_rate?: number | null; vat_type?: string | null }[];
  invoices?: { customer_id?: string | null; invoice_date?: string; location_id?: string | null; balance_os?: number | null }[];
  editId?: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(initialEditId ?? null);

  const products = productsProp;
  const customers = customersProp;
  const salesReps = salesRepsProp;
  const locations = locationsProp;
  const priceTypes = priceTypesProp;
  const priceLists = priceListsProp;
  const priceListItems = priceListItemsProp;
  const invoices = invoicesProp;

  useEffect(() => {
    if (initialEditId) setShowForm(true);
  }, [initialEditId]);

  const editingOrder = orders.find((o) => o.id === editingId) ?? null;
  const editingLines = editingId ? lines.filter((l) => l.sales_order_id === editingId) : [];

  async function handleDelete(id: string) {
    if (!confirm("Delete this sales order?")) return;
    const res = await deleteSalesOrder(id);
    if (res?.error) alert(res.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Sales Order Management</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setShowForm(true);
            }}
            style={{ backgroundColor: "var(--navbar)" }}
            className="text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Sales Order
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
              <th className="border-b border-r border-border px-3 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>Order No</th>
              <th className="border-b border-r border-border px-3 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>Customer</th>
              <th className="border-b border-r border-border px-3 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>Order Date</th>
              <th className="border-b border-r border-border px-3 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>Delivery Date</th>
              <th className="border-b border-r border-border px-3 py-2 text-right font-medium" style={{ color: "var(--navbar)" }}>Grand Total</th>
              <th className="border-b border-border px-3 py-2 text-center font-medium" style={{ color: "var(--navbar)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="border-b border-border px-3 py-8 text-center text-muted-foreground">
                  No sales orders yet. Click &quot;New Sales Order&quot; to create one.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="border-b border-border hover:bg-muted/30">
                  <td className="border-r border-border px-3 py-2 font-medium">{order.order_no}</td>
                  <td className="border-r border-border px-3 py-2">{order.customers?.name ?? "—"}</td>
                  <td className="border-r border-border px-3 py-2">{order.order_date}</td>
                  <td className="border-r border-border px-3 py-2">{order.delivery_date ?? "—"}</td>
                  <td className="border-r border-border px-3 py-2 text-right tabular-nums">{formatMoney(order.grand_total)}</td>
                  <td className="border-border px-3 py-2">
                    <div className="flex justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          setEditingId(order.id);
                          setShowForm(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(order.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <SalesOrderFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        onSaved={() => {
          setShowForm(false);
          setEditingId(null);
        }}
        products={products}
        customers={customers}
        customersError={customersError}
        salesReps={salesReps}
        locations={locations}
        priceTypes={priceTypes}
        priceLists={priceLists}
        priceListItems={priceListItems}
        invoices={invoices}
        initialOrder={editingOrder}
        initialLines={editingLines}
      />
    </div>
  );
}
