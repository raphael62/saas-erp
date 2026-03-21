"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addMasterDataRow, deleteMasterDataRow } from "@/app/dashboard/settings/master-data/actions";

const TABS = [
  { id: "brand-categories", label: "Brand Categories", table: "brand_categories" as const },
  { id: "empties-types", label: "Empties Types", table: "empties_types" as const },
  { id: "price-types", label: "Price Types", table: "price_types" as const },
  { id: "units-of-measure", label: "Units of Measure", table: "units_of_measure" as const },
  { id: "payment-methods", label: "Payment Methods", table: "payment_methods" as const },
  { id: "location-types", label: "Location Types", table: "location_types" as const },
  { id: "customer-groups", label: "Customer Groups", table: "customer_groups" as const },
  { id: "customer-types", label: "Customer Types", table: "customer_types" as const },
] as const;

type Row = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  product_count?: number;
  is_active: boolean;
};

type MasterDataTableProps = {
  activeTab: string;
  rows: Row[];
  tableName: string;
};

export function MasterDataTable({ activeTab, rows, tableName }: MasterDataTableProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [page, setPage] = useState(1);

  const tabConfig = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const table = tabConfig.table;

  function setTab(id: string) {
    router.push(`/dashboard/settings/master-data?tab=${id}`);
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const result = await addMasterDataRow(table, formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    (e.target as HTMLFormElement).reset();
    setShowForm(false);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this record?")) return;
    setPending(true);
    const result = await deleteMasterDataRow(table, id);
    setPending(false);
    if (result?.error) setError(result.error);
    else router.refresh();
  }

  function refresh() {
    router.refresh();
  }

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const start = (page - 1) * rowsPerPage;
  const paginatedRows = rows.slice(start, start + rowsPerPage);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? "border-[var(--navbar)] text-[var(--navbar)]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" />
          New (F2)
        </Button>
        <Button size="sm" variant="outline" disabled>
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
        <Button size="sm" variant="outline" disabled>
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
        <Button size="sm" variant="outline" onClick={refresh}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
        <Button size="sm" variant="outline" disabled>
          <Search className="h-4 w-4" />
          Search (F2)
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium mb-3">New {tabConfig.label.slice(0, -1)}</h3>
          <form onSubmit={handleAdd} className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Code *</label>
              <input name="code" required className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Name *</label>
              <input name="name" required className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Description</label>
              <input name="description" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted/50 px-4 py-2 text-sm font-medium">
          {tabConfig.label} ({totalRows} records)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                <th className="w-10 px-3 py-2">
                  <input type="checkbox" className="rounded" aria-label="Select all" />
                </th>
                <th className="px-3 py-2 text-left font-medium">Code</th>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                {table === "brand_categories" && (
                  <th className="px-3 py-2 text-right font-medium">Product Count</th>
                )}
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, i) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 text-muted-foreground">{start + i + 1}</td>
                  <td className="px-3 py-2">
                    <input type="checkbox" className="rounded" />
                  </td>
                  <td className="px-3 py-2 font-medium">{row.code}</td>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.description ?? "—"}</td>
                  {table === "brand_categories" && (
                    <td className="px-3 py-2 text-right">{row.product_count ?? 0}</td>
                  )}
                  <td className="px-3 py-2">
                    <span className={row.is_active ? "text-green-600" : "text-muted-foreground"}>
                      {row.is_active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(row.id)}
                      disabled={pending}
                      className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {table === "brand_categories" && (
              <tfoot>
                <tr className="border-t border-border bg-muted/30 font-medium">
                  <td colSpan={4} className="px-3 py-2">Grand Total</td>
                  <td className="px-3 py-2 text-right">
                    {rows.reduce((s, r) => s + (r.product_count ?? 0), 0)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(Number(e.target.value))}
              className="rounded border border-border bg-background px-2 py-1 text-sm"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">
              {totalRows === 0 ? "0" : `${start + 1}-${Math.min(start + rowsPerPage, totalRows)}`} of {totalRows}
            </span>
            <span>Page {page} of {totalPages}</span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ←
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                →
              </Button>
            </div>
            <span className="flex items-center gap-1">
              Goto
              <input
                type="number"
                min={1}
                max={totalPages}
                value={page}
                onChange={(e) => setPage(Math.min(totalPages, Math.max(1, Number(e.target.value) || 1)))}
                className="w-14 rounded border border-border bg-background px-2 py-1 text-sm"
              />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
