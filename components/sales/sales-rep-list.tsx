"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SalesRepFormDialog } from "@/components/sales/sales-rep-form-dialog";

type SalesRep = {
  id: string;
  name: string;
  code: string | null;
  first_name?: string | null;
  last_name?: string | null;
  sales_rep_type?: string | null;
  phone: string | null;
  email?: string | null;
  location?: string | null;
  is_active?: boolean;
};

export function SalesRepList({ salesReps }: { salesReps: SalesRep[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(searchParams.get("add") === "1");
  const [editingSalesRep, setEditingSalesRep] = useState<SalesRep | null>(null);
  const [search, setSearch] = useState("");
  const [includeDeactivated, setIncludeDeactivated] = useState(false);
  const [page, setPage] = useState(1);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<keyof SalesRep>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const PAGE_SIZE = 25;
  const PAGE_BUTTONS = 10;
  const CHECKBOX_COL_WIDTH = 48;
  const ROW_NUMBER_COL_WIDTH = 40;
  const columns: Array<{
    key: keyof SalesRep;
    label: string;
    width: number;
    sortable?: boolean;
  }> = [
    { key: "code", label: "Executive Code", width: 140, sortable: true },
    { key: "name", label: "Full Name", width: 190, sortable: true },
    { key: "phone", label: "Phone", width: 140, sortable: true },
    { key: "email", label: "Email", width: 200, sortable: true },
    { key: "location", label: "Location", width: 140, sortable: true },
    { key: "sales_rep_type", label: "Rep Type", width: 130, sortable: true },
    { key: "is_active", label: "Status", width: 100, sortable: true },
  ];

  const tableWidth = CHECKBOX_COL_WIDTH + ROW_NUMBER_COL_WIDTH + columns.reduce((acc, col) => acc + col.width, 0);

  const filtered = useMemo(() => {
    let list = salesReps;
    if (!includeDeactivated) {
      list = list.filter((rep) => rep.is_active !== false);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((rep) => Object.values(rep).some((value) => String(value ?? "").toLowerCase().includes(q)));
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
  }, [salesReps, includeDeactivated, search, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        setEditingSalesRep(null);
        setShowForm(true);
      }
      if (e.key === "F3") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleSort = (col: keyof SalesRep) => {
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
    else setSelectedIds(new Set(paginated.map((rep) => rep.id)));
  };

  const SortIcon = ({ direction }: { direction: "asc" | "desc" | null }) => {
    if (!direction) return <ChevronDown className="h-3 w-3 inline opacity-50" style={{ color: "var(--navbar)" }} />;
    return direction === "asc"
      ? <ChevronUp className="h-3 w-3 inline" style={{ color: "var(--navbar)" }} />
      : <ChevronDown className="h-3 w-3 inline" style={{ color: "var(--navbar)" }} />;
  };

  const formatValue = (rep: SalesRep, key: keyof SalesRep) => {
    if (key === "code" || key === "name") {
      const text = rep[key] ?? "—";
      return (
        <button
          type="button"
          className="text-left text-[var(--navbar)] hover:underline"
          onClick={() => {
            setEditingSalesRep(rep);
            setShowForm(true);
          }}
        >
          {text}
        </button>
      );
    }
    if (key === "is_active") return rep.is_active === false ? "Inactive" : "Active";
    return rep[key] ?? "—";
  };

  return (
    <div className="flex min-h-[400px] flex-col">
      <div className="space-y-3 pb-3">
        <h1 className="text-xl font-semibold">Business Executives</h1>
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

      <SalesRepFormDialog
        key={editingSalesRep?.id ?? "new-sales-rep"}
        open={showForm}
        onOpenChange={(next) => {
          setShowForm(next);
          if (!next) setEditingSalesRep(null);
        }}
        onSaved={() => router.refresh()}
        initialSalesRep={editingSalesRep}
      />

      <div className="max-h-[calc(100vh-18rem)] overflow-auto rounded border border-border">
        {filtered.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            No business executives. Add one using New (F2).
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
              {paginated.map((sr, i) => (
                <tr
                  key={sr.id}
                  className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/30"}`}
                >
                  <td className="border-r border-border px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(sr.id)}
                      onChange={() => toggleSelect(sr.id)}
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
                      {formatValue(sr, col.key)}
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
            setEditingSalesRep(null);
            setShowForm(true);
          }}
          style={{ color: "var(--navbar)", borderColor: "var(--navbar)" }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New (F2)
        </Button>
        <span className="text-muted-foreground">|</span>
        <Button variant="outline" size="sm" disabled className="opacity-60">
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
        title="Business Executives Help"
        showGearIcon={false}
        contentClassName="max-w-lg text-sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">How to use this page:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Click Executive Code or Full Name to edit an executive.</li>
            <li>Press F2 to create a new executive.</li>
            <li>Use Search (F3) and column sorting to find records quickly.</li>
            <li>Use Include Deactivated to show inactive executives.</li>
          </ul>
          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowHelpDialog(false)}>Close</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
