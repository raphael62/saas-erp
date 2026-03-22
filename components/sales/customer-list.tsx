"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CustomerFormDialog } from "@/components/sales/customer-form-dialog";

type Customer = {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_id?: string | null;
  credit_limit: number;
  payment_terms: number;
  customer_type: string | null;
  price_type: string | null;
  sales_rep_id: string | null;
  is_active?: boolean;
  sales_reps?: { id: string; name: string } | null;
};

type LookupItem = { id: string; code?: string; name: string };

export function CustomerList({
  customers,
  salesReps = [],
  customerTypes = [],
  priceTypes = [],
}: {
  customers: Customer[];
  salesReps?: { id: string; name: string }[];
  customerTypes?: LookupItem[];
  priceTypes?: LookupItem[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(searchParams.get("add") === "1");
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");
  const [includeDeactivated, setIncludeDeactivated] = useState(false);
  const [page, setPage] = useState(1);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<keyof Customer>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (searchParams.get("add") === "1") setShowForm(true);
  }, [searchParams]);

  const PAGE_SIZE = 25;
  const PAGE_BUTTONS = 10;
  const CHECKBOX_COL_WIDTH = 48;
  const ROW_NUMBER_COL_WIDTH = 40;
  const columns: Array<{
    key: keyof Customer;
    label: string;
    width: number;
    sortable?: boolean;
  }> = [
    { key: "tax_id", label: "Customer Code", width: 140, sortable: true },
    { key: "name", label: "Customer Name", width: 210, sortable: true },
    { key: "contact_person", label: "Business Name", width: 170, sortable: true },
    { key: "phone", label: "Mobile", width: 130, sortable: true },
    { key: "email", label: "Email", width: 220, sortable: true },
    { key: "price_type", label: "Price Type", width: 140, sortable: true },
    { key: "customer_type", label: "Customer Type", width: 140, sortable: true },
    { key: "sales_rep_id", label: "Business Executive", width: 170, sortable: true },
    { key: "credit_limit", label: "Credit Limit", width: 120, sortable: true },
    { key: "is_active", label: "Status", width: 100, sortable: true },
  ];

  const tableWidth = CHECKBOX_COL_WIDTH + ROW_NUMBER_COL_WIDTH + columns.reduce((acc, col) => acc + col.width, 0);

  const filtered = useMemo(() => {
    let list = customers;
    if (!includeDeactivated) list = list.filter((customer) => customer.is_active !== false);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((customer) =>
        Object.values(customer).some((value) => String(value ?? "").toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      const cmp =
        av == null && bv == null
          ? 0
          : av == null
            ? 1
            : bv == null
              ? -1
              : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [customers, includeDeactivated, search, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        setEditingCustomer(null);
        setShowForm(true);
      }
      if (e.key === "F3") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleSort = (col: keyof Customer) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortCol(col);
    setSortDir("asc");
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginated.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginated.map((customer) => customer.id)));
  };

  const selectedCustomer = customers.find((customer) => selectedIds.has(customer.id)) ?? null;

  const SortIcon = ({ direction }: { direction: "asc" | "desc" | null }) => {
    if (!direction) return <ChevronDown className="h-3 w-3 inline opacity-50" style={{ color: "var(--navbar)" }} />;
    return direction === "asc"
      ? <ChevronUp className="h-3 w-3 inline" style={{ color: "var(--navbar)" }} />
      : <ChevronDown className="h-3 w-3 inline" style={{ color: "var(--navbar)" }} />;
  };

  const formatValue = (customer: Customer, key: keyof Customer) => {
    if (key === "tax_id" || key === "name") {
      const text = key === "tax_id" ? customer.tax_id ?? "—" : customer.name;
      return (
        <button
          type="button"
          className="text-left text-[var(--navbar)] hover:underline"
          onClick={() => {
            setEditingCustomer(customer);
            setShowForm(true);
          }}
        >
          {text}
        </button>
      );
    }
    if (key === "credit_limit") return Number(customer.credit_limit ?? 0).toFixed(2);
    if (key === "sales_rep_id") {
      const sr = customer.sales_reps;
      return (Array.isArray(sr) ? sr[0]?.name : sr?.name) ?? "—";
    }
    if (key === "is_active") return customer.is_active === false ? "Inactive" : "Active";
    const v = customer[key];
    if (v !== null && typeof v === "object" && "name" in v) return (v as { name: string }).name;
    return v ?? "—";
  };

  return (
    <div className="flex min-h-[400px] flex-col">
      <div className="space-y-3 pb-3">
        <h1 className="text-xl font-semibold">Customer List</h1>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeDeactivated}
              onChange={(e) => {
                setIncludeDeactivated(e.target.checked);
                setPage(1);
              }}
              className="h-3.5 w-3.5 rounded"
            />
            <span style={{ color: "var(--navbar)" }}>Include Deactivated</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search (F3)"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-8 w-48 rounded border border-input bg-background px-2.5 text-sm"
            />
            <Button
              size="sm"
              className="text-white"
              style={{ backgroundColor: "var(--navbar)" }}
              onClick={() => setPage(1)}
            >
              Search (F3)
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowHelpDialog(true)}>
              Help
            </Button>
          </div>
        </div>

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(PAGE_BUTTONS, totalPages) }, (_, i) => {
              const p = i + 1;
              const isActive = p === page;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`h-7 min-w-[1.75rem] rounded px-2 text-sm font-medium ${
                    isActive
                      ? "text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  style={isActive ? { backgroundColor: "var(--navbar)" } : undefined}
                >
                  {p}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="ml-2 text-sm text-muted-foreground">/ {totalPages}</span>
          </div>
        )}
      </div>

      <CustomerFormDialog
        key={editingCustomer?.id ?? "new-customer"}
        open={showForm}
        onOpenChange={(next) => {
          setShowForm(next);
          if (!next) setEditingCustomer(null);
        }}
        onSaved={() => router.refresh()}
        salesReps={salesReps}
        customerTypes={customerTypes}
        priceTypes={priceTypes}
        onLookupChanged={() => router.refresh()}
        initialCustomer={editingCustomer}
      />

      <div className="max-h-[calc(100vh-18rem)] overflow-auto rounded border border-border">
        {filtered.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            No customers found. Add one using New (F2).
          </div>
        ) : (
          <table className="text-sm" style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <th
                  className="border-b border-r border-border px-2 py-2"
                  style={{ width: CHECKBOX_COL_WIDTH, minWidth: CHECKBOX_COL_WIDTH }}
                >
                  <input
                    type="checkbox"
                    checked={paginated.length > 0 && selectedIds.size === paginated.length}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 rounded"
                  />
                </th>
                <th
                  className="border-b border-r border-border px-2 py-2 text-left font-medium"
                  style={{ width: ROW_NUMBER_COL_WIDTH, minWidth: ROW_NUMBER_COL_WIDTH }}
                >
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="border-b border-r border-border px-2 py-2 text-left font-medium"
                    style={{ width: col.width, minWidth: col.width }}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="flex items-center gap-1"
                      >
                        {col.label} <SortIcon direction={sortCol === col.key ? sortDir : null} />
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((customer, i) => (
                <tr
                  key={customer.id}
                  className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/30"}`}
                >
                  <td className="border-r border-border px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(customer.id)}
                      onChange={() => toggleSelect(customer.id)}
                      className="h-3.5 w-3.5 rounded"
                    />
                  </td>
                  <td className="border-r border-border px-2 py-1.5 text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="border-r border-border px-2 py-1.5"
                      style={{ width: col.width, minWidth: col.width }}
                    >
                      {formatValue(customer, col.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingCustomer(null);
            setShowForm(true);
          }}
          style={{ color: "var(--navbar)", borderColor: "var(--navbar)" }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New (F2)
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!selectedCustomer}
          onClick={() => {
            if (!selectedCustomer) return;
            setEditingCustomer(selectedCustomer);
            setShowForm(true);
          }}
        >
          Change
        </Button>
        <Button variant="outline" size="sm" disabled className="opacity-60">
          Deactive/Reactivate
        </Button>
        <Button variant="outline" size="sm" disabled className="opacity-60">
          Excel
        </Button>
      </div>

      <Dialog
        open={showHelpDialog}
        onOpenChange={setShowHelpDialog}
        title="Customer List Help"
        showGearIcon={false}
        contentClassName="max-w-lg text-sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">How to use this page:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Click Customer Code or Customer Name to edit a customer.</li>
            <li>Press F2 to create a new customer.</li>
            <li>Use Search (F3) and column sorting to find records quickly.</li>
            <li>Use Include Deactivated to show inactive customers.</li>
          </ul>
          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowHelpDialog(false)}>Close</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
