"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteSalesInvoice } from "@/app/dashboard/sales/sales-invoices/actions";
import { SalesInvoiceFormDialog } from "@/components/sales/sales-invoice-form-dialog";

type Invoice = {
  id: string;
  invoice_no: string;
  customer_id?: string | null;
  sales_rep_id?: string | null;
  location_id?: string | null;
  invoice_date: string;
  delivery_date?: string | null;
  vat_invoice_no?: string | null;
  driver_name?: string | null;
  vehicle_no?: string | null;
  payment_terms?: string | null;
  type_status?: string | null;
  notes?: string | null;
  balance_os?: number | null;
  total_qty?: number | null;
  sub_total?: number | null;
  tax_total?: number | null;
  grand_total?: number | null;
  created_at?: string | null;
  customers?: { id: string; name: string } | null;
  sales_reps?: { id: string; name: string } | null;
  locations?: { id: string; code?: string | null; name: string } | null;
};

type InvoiceLine = {
  id: string;
  sales_invoice_id: string;
  product_id?: string | null;
  item_name_snapshot?: string | null;
  price_type?: string | null;
  pack_unit?: number | null;
  qty?: number | null;
  cl_qty?: number | null;
  free_qty?: number | null;
  price_ex?: number | null;
  price_tax_inc?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  value_tax_inc?: number | null;
  vat_type?: string | null;
  row_no?: number | null;
};

type Product = {
  id: string | number;
  code?: string | null;
  name: string;
  pack_unit?: number | null;
  stock_quantity?: number | null;
  empties_type?: string | null;
  bottle_cost?: number | null;
  plastic_cost?: number | null;
  returnable?: boolean | null;
};

type Customer = {
  id: string;
  tax_id?: string | null;
  name: string;
  payment_terms?: number | null;
  sales_rep_id?: string | null;
  price_type?: string | null;
  location_id?: string | null;
};
type SalesRep = { id: string; code?: string | null; name: string };
type Location = { id: string; code?: string | null; name: string };
type PriceType = { id: string; code?: string | null; name: string };
type PriceList = {
  id: string;
  price_type_id: string;
  effective_date?: string | null;
  expiry_date?: string | null;
  is_active?: boolean | null;
  price_types?: { name?: string | null } | null;
};
type PriceListItem = {
  price_list_id: string;
  product_id: string | number;
  price?: number | null;
  tax_rate?: number | null;
  vat_type?: string | null;
};
type Promotion = {
  id: string;
  promo_code: string;
  name: string;
  promo_budget_cartons?: number | null;
  consumed_cartons?: number | null;
  start_date: string;
  end_date: string;
  is_active?: boolean | null;
  eligible_price_types?: string[] | null;
  eligible_location_ids?: string[] | null;
  days_of_week?: number[] | null;
  happy_hour_start?: string | null;
  happy_hour_end?: string | null;
};
type PromotionRule = {
  promotion_id: string;
  buy_product_id: string | number;
  buy_qty?: number | null;
  buy_unit?: string | null;
  reward_product_id: string | number;
  reward_qty?: number | null;
  reward_unit?: string | null;
  row_no?: number | null;
};

type SortCol =
  | "invoice_no"
  | "customer"
  | "invoice_date"
  | "delivery_date"
  | "tax_total"
  | "grand_total";

function formatMoney(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function SalesInvoiceList({
  invoices = [],
  lines = [],
  products = [],
  customers = [],
  salesReps = [],
  locations = [],
  priceTypes = [],
  priceLists = [],
  priceListItems = [],
  promotions = [],
  promotionRules = [],
  editId,
}: {
  invoices: Invoice[];
  lines: InvoiceLine[];
  products: Product[];
  customers: Customer[];
  salesReps: SalesRep[];
  locations: Location[];
  priceTypes: PriceType[];
  priceLists: PriceList[];
  priceListItems: PriceListItem[];
  promotions: Promotion[];
  promotionRules: PromotionRule[];
  editId?: string;
}) {
  const router = useRouter();
  const openEditId = editId && invoices.some((inv) => inv.id === editId) ? editId : null;

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState<SortCol>("invoice_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(openEditId);
  const [showForm, setShowForm] = useState(Boolean(openEditId));
  const [editingId, setEditingId] = useState<string | null>(openEditId);
  const [message, setMessage] = useState<string | null>(null);

  const lineMap = useMemo(() => {
    const map = new Map<string, InvoiceLine[]>();
    for (const line of lines) {
      if (!map.has(line.sales_invoice_id)) map.set(line.sales_invoice_id, []);
      map.get(line.sales_invoice_id)!.push(line);
    }
    return map;
  }, [lines]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = invoices.filter((inv) => {
      if (fromDate && inv.invoice_date < fromDate) return false;
      if (toDate && inv.invoice_date > toDate) return false;
      if (!q) return true;
      return (
        (inv.invoice_no ?? "").toLowerCase().includes(q) ||
        (inv.customers?.name ?? "").toLowerCase().includes(q) ||
        (inv.sales_reps?.name ?? "").toLowerCase().includes(q) ||
        (inv.locations?.name ?? "").toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      const av =
        sortCol === "invoice_no"
          ? a.invoice_no
          : sortCol === "customer"
            ? a.customers?.name ?? ""
            : sortCol === "invoice_date"
              ? a.invoice_date
              : sortCol === "delivery_date"
                ? a.delivery_date ?? ""
                : sortCol === "tax_total"
                  ? String(a.tax_total ?? 0)
                  : sortCol === "grand_total"
                    ? String(a.grand_total ?? 0)
                    : "";
      const bv =
        sortCol === "invoice_no"
          ? b.invoice_no
          : sortCol === "customer"
            ? b.customers?.name ?? ""
            : sortCol === "invoice_date"
              ? b.invoice_date
              : sortCol === "delivery_date"
                ? b.delivery_date ?? ""
                : sortCol === "tax_total"
                  ? String(b.tax_total ?? 0)
                  : sortCol === "grand_total"
                    ? String(b.grand_total ?? 0)
                    : "";
      const cmp = String(av).localeCompare(String(bv), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [invoices, search, fromDate, toDate, sortCol, sortDir]);

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const selected = filtered.find((x) => x.id === selectedId) ?? null;
  const editing = filtered.find((x) => x.id === editingId) ?? null;

  useEffect(() => {
    if (openEditId) window.history.replaceState(null, "", "/dashboard/sales/sales-invoices");
  }, [openEditId]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortCol(col);
    setSortDir("asc");
  }

  async function handleDelete() {
    if (!selected) return;
    if (!confirm("Delete this invoice?")) return;
    const result = await deleteSalesInvoice(selected.id);
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    setMessage("Invoice deleted.");
    setSelectedId(null);
    router.refresh();
  }

  const SortIcon = ({ active }: { active: boolean }) =>
    active ? (
      sortDir === "asc" ? (
        <ChevronUp className="h-3.5 w-3.5" />
      ) : (
        <ChevronDown className="h-3.5 w-3.5" />
      )
    ) : (
      <ChevronDown className="h-3.5 w-3.5 opacity-40" />
    );

  const hideList = Boolean(openEditId) && showForm;

  return (
    <div className="space-y-3">
      {!hideList && (
        <>
          <div>
            <h1 className="text-2xl font-semibold">Sales Invoice Management</h1>
            <p className="text-sm text-muted-foreground">Create, edit, and track customer invoices.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search invoice/customer/rep/location"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-8 w-72 rounded border border-input bg-background px-2.5 text-sm"
            />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded border border-input bg-background px-2 text-xs"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded border border-input bg-background px-2 text-xs"
            />
          </div>

          {message && <p className="text-sm text-muted-foreground">{message}</p>}

          <div className="max-h-[calc(100vh-19rem)] overflow-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("invoice_no")}>
                      Invoice No <SortIcon active={sortCol === "invoice_no"} />
                    </button>
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("customer")}>
                      Customer <SortIcon active={sortCol === "customer"} />
                    </button>
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("invoice_date")}>
                      Invoice Date <SortIcon active={sortCol === "invoice_date"} />
                    </button>
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("delivery_date")}>
                      Delivery Date <SortIcon active={sortCol === "delivery_date"} />
                    </button>
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-right font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <button type="button" className="ml-auto flex items-center gap-1" onClick={() => toggleSort("tax_total")}>
                      Tax Amt <SortIcon active={sortCol === "tax_total"} />
                    </button>
                  </th>
                  <th className="border-b border-border px-2 py-2 text-right font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <button type="button" className="ml-auto flex items-center gap-1" onClick={() => toggleSort("grand_total")}>
                      Total Amt (Tax Inc) <SortIcon active={sortCol === "grand_total"} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      No invoices found.
                    </td>
                  </tr>
                ) : (
                  paginated.map((row, i) => {
                    const active = selectedId === row.id;
                    return (
                      <tr
                        key={row.id}
                        className={`cursor-pointer border-b border-border last:border-0 ${
                          active
                            ? "bg-muted/60"
                            : i % 2 === 0
                              ? "bg-background hover:bg-muted/20"
                              : "bg-muted/30 hover:bg-muted/50"
                        }`}
                        onClick={() => setSelectedId(row.id)}
                      >
                        <td className="border-r border-border px-2 py-2">
                          <button
                            type="button"
                            className="text-left text-[var(--navbar)] hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(row.id);
                              setShowForm(true);
                            }}
                          >
                            {row.invoice_no}
                          </button>
                        </td>
                        <td className="border-r border-border px-2 py-2">{row.customers?.name ?? "—"}</td>
                        <td className="border-r border-border px-2 py-2">{row.invoice_date}</td>
                        <td className="border-r border-border px-2 py-2">{row.delivery_date ?? "—"}</td>
                        <td className="border-r border-border px-2 py-2 text-right">{formatMoney(row.tax_total)}</td>
                        <td className="border-border px-2 py-2 text-right">{formatMoney(row.grand_total)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {(page - 1) * PAGE_SIZE + (paginated.length ? 1 : 0)}-
              {(page - 1) * PAGE_SIZE + paginated.length} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </Button>
              <span>
                Page {page} / {totalPages}
              </span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </Button>
            </div>
          </div>

          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-3 py-2">
            <Button
              size="sm"
              style={{ backgroundColor: "var(--navbar)" }}
              className="text-white"
              onClick={() => {
                setEditingId(null);
                setShowForm(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New (F2)
            </Button>
            <Button size="sm" variant="outline" disabled={!selected} onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Button size="sm" variant="outline" disabled>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button size="sm" variant="outline" disabled>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
          </div>
        </>
      )}

      <SalesInvoiceFormDialog
        open={showForm}
        onOpenChange={(next) => {
          setShowForm(next);
          if (!next) setEditingId(null);
        }}
        onSaved={() => router.refresh()}
        products={products}
        customers={customers}
        salesReps={salesReps}
        locations={locations}
        priceTypes={priceTypes}
        priceLists={priceLists}
        priceListItems={priceListItems}
        promotions={promotions}
        promotionRules={promotionRules}
        invoices={invoices}
        initialInvoice={editing}
        initialLines={editing ? lineMap.get(editing.id) ?? [] : []}
      />
    </div>
  );
}
