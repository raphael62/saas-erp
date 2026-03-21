"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Eye, FileSpreadsheet, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  deleteEmptiesDispatch,
  getSuggestedDispatchNo,
  saveEmptiesDispatch,
} from "@/app/dashboard/purchases/empties-dispatch/actions";
import {
  clearSupplierStatementEditQueue,
  peekSupplierStatementEditForCurrentPage,
} from "@/lib/statement-edit-bridge";

type Dispatch = {
  id: string;
  dispatch_no: string;
  supplier_id?: string | null;
  location_id?: string | null;
  dispatch_date: string;
  credit_note_date?: string | null;
  dispatch_note_no?: string | null;
  credit_note_no?: string | null;
  po_number?: string | null;
  delivery_note?: string | null;
  notes?: string | null;
  total_qty?: number | null;
  total_value?: number | null;
  created_at?: string | null;
  suppliers?: { id: string; name: string } | null;
  locations?: { id: string; code?: string | null; name: string } | null;
};

type DispatchLine = {
  id: string;
  empties_dispatch_id: string;
  product_id?: string | null;
  product_code_snapshot?: string | null;
  product_name_snapshot?: string | null;
  empties_type?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  total_value?: number | null;
  row_no?: number | null;
};

type Supplier = { id: string; name: string };
type Location = { id: string; code?: string | null; name: string };
type Product = {
  id: string | number;
  code?: string | null;
  name: string;
  empties_type?: string | null;
  bottle_cost?: number | null;
  plastic_cost?: number | null;
  returnable?: boolean | null;
};
type PriceList = {
  id: string;
  price_type_id?: string;
  effective_date?: string | null;
  expiry_date?: string | null;
  is_active?: boolean | null;
  price_types?: { id?: string; code?: string | null; name?: string | null } | null;
};
type PriceListItem = {
  price_list_id: string;
  product_id: string | number;
  price?: number | null;
  tax_rate?: number | null;
};

type SortCol = "dispatch_no" | "supplier" | "dispatch_date" | "total_qty" | "total_value";

function n(v: string | number | null | undefined) {
  const raw = String(v ?? "").replace(/,/g, "").trim();
  const num = Number(raw || 0);
  return Number.isFinite(num) ? num : 0;
}

function fmtComma(value: number | string | null | undefined, fixed = 2) {
  return n(value).toLocaleString(undefined, {
    minimumFractionDigits: fixed,
    maximumFractionDigits: fixed,
  });
}

function fmtCommaInput(value: string | number | null | undefined, fixed = 2) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return "";
  const num = Number(raw);
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: fixed,
    maximumFractionDigits: fixed,
  });
}

type EditLine = {
  key: string;
  product_id: string;
  product_code: string;
  product_name: string;
  empties_type: string;
  qty: string;
  unit_price: string;
  total_value: string;
};

function blankLine(key: string): EditLine {
  return {
    key,
    product_id: "",
    product_code: "",
    product_name: "",
    empties_type: "",
    qty: "",
    unit_price: "",
    total_value: "",
  };
}

function hasLineData(line: EditLine) {
  return Boolean(line.product_id || line.product_name || n(line.qty) > 0 || n(line.unit_price) > 0);
}

function computeLine(merged: EditLine): EditLine {
  const qty = n(merged.qty);
  const unitPrice = n(merged.unit_price);
  const total = qty * unitPrice;
  return {
    ...merged,
    total_value: total > 0 ? total.toFixed(2) : "",
  };
}

type EmptiesDispatchListProps = {
  dispatches: Dispatch[];
  lines: DispatchLine[];
  suppliers: Supplier[];
  locations: Location[];
  products: Product[];
  priceLists: PriceList[];
  priceListItems: PriceListItem[];
  editId?: string;
};

function EmptiesDispatchListContent({
  dispatches = [],
  lines = [],
  suppliers = [],
  locations = [],
  products = [],
  priceLists = [],
  priceListItems = [],
  editId,
}: EmptiesDispatchListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState<SortCol>("dispatch_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const urlEditRaw = searchParams.get("edit");
  const urlEdit = typeof urlEditRaw === "string" && urlEditRaw.trim() !== "" ? urlEditRaw.trim() : undefined;
  const propEdit = typeof editId === "string" && editId.trim() !== "" ? editId.trim() : undefined;
  const resolvedEditId = urlEdit ?? propEdit;
  const openEditId =
    resolvedEditId && dispatches.some((p) => p.id === resolvedEditId) ? resolvedEditId : null;

  useEffect(() => {
    if (!openEditId) return;
    setEditingId(openEditId);
    setShowForm(true);
  }, [openEditId]);

  useEffect(() => {
    const bridged = peekSupplierStatementEditForCurrentPage();
    if (!bridged) return;
    if (!dispatches.some((p) => p.id === bridged)) {
      if (dispatches.length > 0) clearSupplierStatementEditQueue();
      return;
    }
    clearSupplierStatementEditQueue();
    setEditingId(bridged);
    setShowForm(true);
  }, [dispatches]);

  const lineMap = useMemo(() => {
    const map = new Map<string, DispatchLine[]>();
    for (const line of lines) {
      if (!map.has(line.empties_dispatch_id)) map.set(line.empties_dispatch_id, []);
      map.get(line.empties_dispatch_id)!.push(line);
    }
    return map;
  }, [lines]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = dispatches.filter((row) => {
      if (fromDate && row.dispatch_date < fromDate) return false;
      if (toDate && row.dispatch_date > toDate) return false;
      if (!q) return true;
      return (
        String(row.dispatch_no ?? "").toLowerCase().includes(q) ||
        String(row.suppliers?.name ?? "").toLowerCase().includes(q) ||
        String(row.locations?.name ?? "").toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      const av =
        sortCol === "dispatch_no"
          ? a.dispatch_no
          : sortCol === "supplier"
            ? a.suppliers?.name ?? ""
            : sortCol === "dispatch_date"
              ? a.dispatch_date
              : sortCol === "total_qty"
                ? Number(a.total_qty ?? 0)
                : Number(a.total_value ?? 0);
      const bv =
        sortCol === "dispatch_no"
          ? b.dispatch_no
          : sortCol === "supplier"
            ? b.suppliers?.name ?? ""
            : sortCol === "dispatch_date"
              ? b.dispatch_date
              : sortCol === "total_qty"
                ? Number(b.total_qty ?? 0)
                : Number(b.total_value ?? 0);

      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [dispatches, search, fromDate, toDate, sortCol, sortDir]);

  const totalRecords = filtered.length;
  const totalValue = useMemo(() => filtered.reduce((sum, row) => sum + Number(row.total_value ?? 0), 0), [filtered]);

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const selected = filtered.find((x) => x.id === selectedId) ?? null;
  const editing = dispatches.find((x) => x.id === editingId) ?? null;

  async function handleDelete() {
    if (!selected) return;
    if (!confirm("Delete this empties dispatch?")) return;
    const result = await deleteEmptiesDispatch(selected.id);
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    setMessage("Empties dispatch deleted.");
    setSelectedId(null);
    router.refresh();
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortCol(col);
    setSortDir("asc");
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

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">Empties Dispatch</h1>
        <p className="text-sm text-muted-foreground">Dispatch physical empties to suppliers and track stock reduction.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Total Records</p>
          <p className="text-lg font-semibold">{fmtComma(totalRecords, 0)}</p>
        </div>
        <div className="rounded border border-border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Total Value GHS</p>
          <p className="text-lg font-semibold">{fmtComma(totalValue, 2)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search dispatch/supplier/location"
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

      {message && <p className="rounded border border-border bg-muted/30 px-3 py-1.5 text-sm">{message}</p>}

      <div className="max-h-[calc(100vh-20rem)] overflow-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("dispatch_no")}>
                  Dispatch No <SortIcon active={sortCol === "dispatch_no"} />
                </button>
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("supplier")}>
                  Supplier <SortIcon active={sortCol === "supplier"} />
                </button>
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("dispatch_date")}>
                  Dispatch Date <SortIcon active={sortCol === "dispatch_date"} />
                </button>
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                Location
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-right font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <button type="button" className="ml-auto flex items-center gap-1" onClick={() => toggleSort("total_qty")}>
                  Items <SortIcon active={sortCol === "total_qty"} />
                </button>
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-right font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <button type="button" className="ml-auto flex items-center gap-1" onClick={() => toggleSort("total_value")}>
                  Total Value GHS <SortIcon active={sortCol === "total_value"} />
                </button>
              </th>
              <th className="border-b border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  No empties dispatch records found.
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
                        {row.dispatch_no}
                      </button>
                    </td>
                    <td className="border-r border-border px-2 py-2">{row.suppliers?.name ?? "—"}</td>
                    <td className="border-r border-border px-2 py-2">{row.dispatch_date}</td>
                    <td className="border-r border-border px-2 py-2">{row.locations?.name ?? "—"}</td>
                    <td className="border-r border-border px-2 py-2 text-right">{fmtComma(row.total_qty, 2)}</td>
                    <td className="border-r border-border px-2 py-2 text-right">{fmtComma(row.total_value, 2)}</td>
                    <td className="px-2 py-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(row.id);
                          setShowForm(true);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </td>
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
        <Button
          size="sm"
          variant="outline"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            setEditingId(selected.id);
            setShowForm(true);
          }}
        >
          View
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            setEditingId(selected.id);
            setShowForm(true);
          }}
        >
          Edit
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

      <EmptiesDispatchFormDialog
        open={showForm}
        onOpenChange={(next) => {
          setShowForm(next);
          if (!next) {
            setEditingId(null);
            if (searchParams.get("edit")) {
              router.replace("/dashboard/purchases/empties-dispatch", { scroll: false });
            }
          }
        }}
        onSaved={() => router.refresh()}
        suppliers={suppliers}
        locations={locations}
        products={products}
        priceLists={priceLists}
        priceListItems={priceListItems}
        initialDispatch={editing}
        initialLines={editing ? lineMap.get(editing.id) ?? [] : []}
      />
    </div>
  );
}

export function EmptiesDispatchList(props: EmptiesDispatchListProps) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading empties dispatch…</div>}>
      <EmptiesDispatchListContent {...props} />
    </Suspense>
  );
}

function EmptiesDispatchFormDialog({
  open,
  onOpenChange,
  onSaved,
  suppliers = [],
  locations = [],
  products = [],
  priceLists = [],
  priceListItems = [],
  initialDispatch = null,
  initialLines = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  suppliers?: Supplier[];
  locations?: Location[];
  products?: Product[];
  priceLists?: PriceList[];
  priceListItems?: PriceListItem[];
  initialDispatch?: Dispatch | null;
  initialLines?: DispatchLine[];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dispatchNo, setDispatchNo] = useState("");
  const [dispatchNoTouched, setDispatchNoTouched] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [dispatchDate, setDispatchDate] = useState("");
  const [creditNoteDate, setCreditNoteDate] = useState("");
  const [locationId, setLocationId] = useState("");
  const [dispatchNoteNo, setDispatchNoteNo] = useState("");
  const [creditNoteNo, setCreditNoteNo] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);

  const [lineDropdown, setLineDropdown] = useState<{ row: number; field: "code" | "name" } | null>(null);

  const productLookup = useMemo(() => {
    const byId = new Map<string, Product>();
    const byCode = new Map<string, Product>();
    const byName = new Map<string, Product>();
    for (const p of products) {
      const id = String(p.id);
      byId.set(id, p);
      if (p.code) byCode.set(p.code.toLowerCase(), p);
      byName.set(p.name.toLowerCase(), p);
    }
    return { byId, byCode, byName };
  }, [products]);

  function dateOrMin(value?: string | null) {
    return String(value ?? "0000-01-01");
  }

  const normalizedPriceLists = useMemo(
    () =>
      (priceLists ?? [])
        .filter((pl) => pl.is_active !== false)
        .map((pl) => {
          const typeName = String(pl.price_types?.name ?? "").toLowerCase().trim();
          const typeCode = String(pl.price_types?.code ?? "").toLowerCase().trim();
          const isCostType =
            typeName.includes("cost") ||
            typeCode.includes("cost") ||
            typeCode === "cp";
          return { ...pl, isCostType };
        })
        .sort((a, b) =>
          dateOrMin(b.effective_date).localeCompare(dateOrMin(a.effective_date))
        ),
    [priceLists]
  );

  const priceItemByListAndProduct = useMemo(() => {
    const map = new Map<string, PriceListItem>();
    for (const item of priceListItems ?? []) {
      map.set(`${item.price_list_id}|${String(item.product_id)}`, item);
    }
    return map;
  }, [priceListItems]);

  function getCostPriceForProduct(
    productId: string,
    onDate: string
  ): number | null {
    if (!productId || !onDate) return null;
    const inRangeLists = normalizedPriceLists.filter((pl) => {
      const eff = dateOrMin(pl.effective_date);
      const exp = pl.expiry_date ? String(pl.expiry_date) : "";
      if (eff > onDate) return false;
      if (exp && exp < onDate) return false;
      return true;
    });
    const preferredLists = inRangeLists.some((pl) => pl.isCostType)
      ? inRangeLists.filter((pl) => pl.isCostType)
      : inRangeLists;
    for (const pl of preferredLists) {
      const item = priceItemByListAndProduct.get(`${pl.id}|${productId}`);
      if (item && item.price != null) return Number(item.price);
    }
    return null;
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDispatchNo(initialDispatch?.dispatch_no ?? "");
    setDispatchNoTouched(Boolean(initialDispatch?.id || initialDispatch?.dispatch_no));
    setSupplierId(initialDispatch?.supplier_id ?? "");
    setDispatchDate(initialDispatch?.dispatch_date ?? new Date().toISOString().slice(0, 10));
    setCreditNoteDate(initialDispatch?.credit_note_date ?? "");
    setLocationId(initialDispatch?.location_id ?? "");
    setDispatchNoteNo(initialDispatch?.dispatch_note_no ?? "");
    setCreditNoteNo(initialDispatch?.credit_note_no ?? "");
    setPoNumber(initialDispatch?.po_number ?? "");
    setDeliveryNote(initialDispatch?.delivery_note ?? "");
    setNotes(initialDispatch?.notes ?? "");

    const seeded = (initialLines ?? [])
      .sort((a, b) => Number(a.row_no ?? 0) - Number(b.row_no ?? 0))
      .map((line, i) => ({
        key: String(i),
        product_id: String(line.product_id ?? ""),
        product_code: String(line.product_code_snapshot ?? ""),
        product_name: String(line.product_name_snapshot ?? ""),
        empties_type: String(line.empties_type ?? ""),
        qty: n(line.qty) ? n(line.qty).toFixed(4) : "",
        unit_price: n(line.unit_price) ? n(line.unit_price).toFixed(2) : "",
        total_value: n(line.total_value) ? n(line.total_value).toFixed(2) : "",
      }));
    if (seeded.length === 0) setLines([blankLine("0")]);
    else setLines([...seeded, blankLine(String(seeded.length))]);
  }, [open, initialDispatch, initialLines]);

  useEffect(() => {
    if (!open) return;
    if (initialDispatch?.id) return;
    if (dispatchNoTouched) return;
    if (!dispatchDate) return;
    const timer = setTimeout(async () => {
      const res = await getSuggestedDispatchNo(dispatchDate.slice(0, 10));
      if (res?.ok && res.dispatchNo) setDispatchNo(res.dispatchNo);
    }, 180);
    return () => clearTimeout(timer);
  }, [open, initialDispatch?.id, dispatchNoTouched, dispatchDate]);

  function updateLine(index: number, patch: Partial<EditLine>) {
    setLines((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = computeLine({ ...current, ...patch });
      const last = next[next.length - 1];
      if (last && hasLineData(last)) next.push(blankLine(String(next.length)));
      return next;
    });
  }

  function deleteLine(index: number) {
    setLines((prev) => {
      if (prev.length <= 1) return [blankLine("0")];
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0 || hasLineData(next[next.length - 1])) next.push(blankLine(String(next.length)));
      return next;
    });
  }

  function applyProductToRow(index: number, product: Product) {
    const priceDate = creditNoteDate || dispatchDate;
    const costPrice = getCostPriceForProduct(String(product.id), priceDate);
    const fallbackPrice = n(product.bottle_cost) + n(product.plastic_cost);
    const price = costPrice ?? (fallbackPrice || null);
    updateLine(index, {
      product_id: String(product.id),
      product_code: String(product.code ?? ""),
      product_name: product.name,
      empties_type: String(product.empties_type ?? ""),
      unit_price: price ? price.toFixed(2) : lines[index]?.unit_price || "",
    });
    setLineDropdown(null);
  }

  function refreshAllLinePrices(nextCreditNoteDate: string) {
    const priceDate = nextCreditNoteDate || dispatchDate;
    setLines((prev) =>
      prev.map((line) => {
        if (!line.product_id) return computeLine(line);
        const costPrice = getCostPriceForProduct(line.product_id, priceDate);
        if (costPrice == null) return computeLine(line);
        return computeLine({ ...line, unit_price: costPrice.toFixed(2) });
      })
    );
  }

  function resolveProduct(index: number, value: string, by: "code" | "name") {
    const product =
      by === "code"
        ? productLookup.byCode.get(value.toLowerCase().trim())
        : productLookup.byName.get(value.toLowerCase().trim());
    if (!product) return;
    applyProductToRow(index, product);
  }

  const totals = useMemo(() => {
    let qty = 0;
    let value = 0;
    for (const line of lines) {
      qty += n(line.qty);
      value += n(line.total_value);
    }
    return { qty, value };
  }, [lines]);

  async function submit(closeAfterSave: boolean) {
    setPending(true);
    setError(null);

    const fd = new FormData();
    if (initialDispatch?.id) fd.set("id", initialDispatch.id);
    if (dispatchNo) fd.set("dispatch_no", dispatchNo);
    fd.set("supplier_id", supplierId);
    fd.set("dispatch_date", dispatchDate);
    fd.set("location_id", locationId);
    if (creditNoteDate) fd.set("credit_note_date", creditNoteDate);
    if (dispatchNoteNo) fd.set("dispatch_note_no", dispatchNoteNo);
    if (creditNoteNo) fd.set("credit_note_no", creditNoteNo);
    if (poNumber) fd.set("po_number", poNumber);
    if (deliveryNote) fd.set("delivery_note", deliveryNote);
    if (notes) fd.set("notes", notes);

    let row = 0;
    for (const line of lines) {
      const hasData = line.product_id || line.product_name || n(line.qty) > 0 || n(line.unit_price) > 0;
      if (!hasData) continue;
      fd.set(`line_product_id_${row}`, line.product_id || "");
      fd.set(`line_product_code_${row}`, line.product_code || "");
      fd.set(`line_product_name_${row}`, line.product_name || "");
      fd.set(`line_empties_type_${row}`, line.empties_type || "");
      fd.set(`line_qty_${row}`, line.qty || "0");
      fd.set(`line_unit_price_${row}`, line.unit_price || "0");
      fd.set(`line_total_value_${row}`, line.total_value || "0");
      row += 1;
    }

    const result = await saveEmptiesDispatch(fd);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }

    onSaved();
    if (closeAfterSave) {
      onOpenChange(false);
      return;
    }

    setDispatchNo("");
    setDispatchNoTouched(false);
    setSupplierId("");
    setDispatchDate(new Date().toISOString().slice(0, 10));
    setCreditNoteDate("");
    setLocationId("");
    setDispatchNoteNo("");
    setCreditNoteNo("");
    setPoNumber("");
    setDeliveryNote("");
    setNotes("");
    setLines([blankLine("0")]);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialDispatch?.id ? "Edit Empties Dispatch" : "New Empties Dispatch"}
      contentClassName="max-w-[1080px] text-sm"
      bodyClassName="max-h-none overflow-visible p-4"
    >
      <div className="space-y-2">
        {error && <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}

        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
          <div>
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Supplier *
            </label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-7 w-full rounded border border-input bg-background px-2 text-sm">
              <option value="">Type or select supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Dispatch Date *
            </label>
            <input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} className="h-7 w-full rounded border border-input bg-background px-2 text-sm" />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Credit Note Date
            </label>
            <input
              type="date"
              value={creditNoteDate}
              onChange={(e) => {
                const nextDate = e.target.value;
                setCreditNoteDate(nextDate);
                refreshAllLinePrices(nextDate);
              }}
              className="h-7 w-full rounded border border-input bg-background px-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Location *
            </label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="h-7 w-full rounded border border-input bg-background px-2 text-sm">
              <option value="">Select Location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {(l.code ? `${l.code} - ` : "") + l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Dispatch Note No.
            </label>
            <input value={dispatchNoteNo} onChange={(e) => setDispatchNoteNo(e.target.value)} className="h-7 w-full rounded border border-input bg-background px-2 text-sm" />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Credit Note No.
            </label>
            <input value={creditNoteNo} onChange={(e) => setCreditNoteNo(e.target.value)} className="h-7 w-full rounded border border-input bg-background px-2 text-sm" />
          </div>

          <div>
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              PO Number
            </label>
            <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className="h-7 w-full rounded border border-input bg-background px-2 text-sm" />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Delivery Note
            </label>
            <input value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} className="h-7 w-full rounded border border-input bg-background px-2 text-sm" />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Dispatch No.
            </label>
            <input
              value={dispatchNo}
              onChange={(e) => {
                const next = e.target.value;
                setDispatchNo(next);
                setDispatchNoTouched(next.trim().length > 0);
              }}
              className="h-7 w-full rounded border border-input bg-background px-2 text-sm"
              placeholder="Auto-generated as yyyy-mm-dd-xxx"
            />
          </div>

          <div className="col-span-3">
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Notes
            </label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-7 w-full rounded border border-input bg-background px-2 text-sm" />
          </div>
        </div>

        <div className="rounded border border-border">
          <div className="border-b border-border bg-muted/20 px-2 py-1 text-[11px] font-medium text-muted-foreground">
            Line Items - Phys Empties Only
          </div>
          <table className="w-full table-fixed text-xs">
            <thead>
              <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <th className="border-b border-r border-border px-1 py-1 text-left" style={{ width: 36 }}>#</th>
                <th className="border-b border-r border-border px-1 py-1 text-left" style={{ width: 120 }}>Product Code</th>
                <th className="border-b border-r border-border px-1 py-1 text-left" style={{ width: 230 }}>Product Name</th>
                <th className="border-b border-r border-border px-1 py-1 text-left" style={{ width: 140 }}>Empties Type</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 96 }}>Qty</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 110 }}>Cost Price</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 120 }}>Total Value</th>
                <th className="border-b border-border px-1 py-1 text-center" style={{ width: 52 }}>Del</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const codeQuery = line.product_code.toLowerCase().trim();
                const nameQuery = line.product_name.toLowerCase().trim();
                const emptiesProducts = products.filter((p) => p.name.toLowerCase().includes("empties"));
                const codeMatches = emptiesProducts.filter(
                  (p) => `${p.code ?? ""}`.toLowerCase().includes(codeQuery) || p.name.toLowerCase().includes(codeQuery)
                );
                const nameMatches = emptiesProducts.filter(
                  (p) => p.name.toLowerCase().includes(nameQuery) || `${p.code ?? ""}`.toLowerCase().includes(nameQuery)
                );

                return (
                  <tr key={line.key} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="border-b border-r border-border px-1 py-0.5 text-muted-foreground">{idx + 1}</td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <div className="relative">
                        <input
                          value={line.product_code}
                          onChange={(e) => {
                            updateLine(idx, { product_code: e.target.value });
                            setLineDropdown({ row: idx, field: "code" });
                          }}
                          onFocus={() => setLineDropdown({ row: idx, field: "code" })}
                          onBlur={(e) => {
                            resolveProduct(idx, e.target.value, "code");
                            setTimeout(() => {
                              setLineDropdown((prev) =>
                                prev && prev.row === idx && prev.field === "code" ? null : prev
                              );
                            }, 120);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (codeMatches.length > 0) applyProductToRow(idx, codeMatches[0]);
                            }
                          }}
                          className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-xs outline-none focus:bg-background"
                        />
                        {lineDropdown?.row === idx && lineDropdown.field === "code" && codeMatches.length > 0 && (
                          <div className="absolute left-0 top-full z-[80] mt-0.5 max-h-48 min-w-[22rem] overflow-auto rounded border border-border bg-background shadow-xl">
                            {codeMatches.slice(0, 20).map((p) => (
                              <button
                                key={String(p.id)}
                                type="button"
                                className="w-full whitespace-nowrap px-2.5 py-2 text-left text-sm font-medium hover:bg-muted/80"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => applyProductToRow(idx, p)}
                              >
                                {(p.code ? `${p.code} - ` : "") + p.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <div className="relative">
                        <input
                          value={line.product_name}
                          onChange={(e) => {
                            updateLine(idx, { product_name: e.target.value });
                            setLineDropdown({ row: idx, field: "name" });
                          }}
                          onFocus={() => setLineDropdown({ row: idx, field: "name" })}
                          onBlur={(e) => {
                            resolveProduct(idx, e.target.value, "name");
                            setTimeout(() => {
                              setLineDropdown((prev) =>
                                prev && prev.row === idx && prev.field === "name" ? null : prev
                              );
                            }, 120);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (nameMatches.length > 0) applyProductToRow(idx, nameMatches[0]);
                            }
                          }}
                          className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-xs outline-none focus:bg-background"
                        />
                        {lineDropdown?.row === idx && lineDropdown.field === "name" && nameMatches.length > 0 && (
                          <div className="absolute left-0 top-full z-[80] mt-0.5 max-h-48 min-w-[26rem] overflow-auto rounded border border-border bg-background shadow-xl">
                            {nameMatches.slice(0, 20).map((p) => (
                              <button
                                key={String(p.id)}
                                type="button"
                                className="w-full whitespace-nowrap px-2.5 py-2 text-left text-sm font-medium hover:bg-muted/80"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => applyProductToRow(idx, p)}
                              >
                                {(p.code ? `${p.code} - ` : "") + p.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <input value={line.empties_type} className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-xs" readOnly />
                    </td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <input
                        value={line.qty}
                        onChange={(e) => updateLine(idx, { qty: e.target.value })}
                        onBlur={(e) => updateLine(idx, { qty: fmtCommaInput(e.target.value, 4) })}
                        className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                      />
                    </td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <input
                        value={line.unit_price}
                        onChange={(e) => updateLine(idx, { unit_price: e.target.value })}
                        onBlur={(e) => updateLine(idx, { unit_price: fmtCommaInput(e.target.value, 2) })}
                        className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                      />
                    </td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <input value={fmtComma(line.total_value, 2)} className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right text-xs" readOnly />
                    </td>
                    <td className="border-b border-border px-1 py-0.5 text-center">
                      <button
                        type="button"
                        onClick={() => deleteLine(idx)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-input bg-background hover:bg-muted"
                        aria-label="Delete line"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-semibold">
                <td colSpan={4} className="border-t border-r border-border px-2 py-1 text-right" />
                <td className="border-t border-r border-border px-2 py-1 text-right">{fmtComma(totals.qty, 2)}</td>
                <td className="border-t border-r border-border px-2 py-1 text-right">—</td>
                <td className="border-t border-r border-border px-2 py-1 text-right">{fmtComma(totals.value, 2)}</td>
                <td className="border-t border-border px-2 py-1" />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="rounded border border-border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
          Stock is reduced at location using dispatch date. Supplier account credited using credit note date.
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-2">
          <Button size="sm" style={{ backgroundColor: "#bf1d2d" }} className="text-white" onClick={() => submit(true)} disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
          <Button size="sm" style={{ backgroundColor: "#1976d2" }} className="text-white" onClick={() => submit(false)} disabled={pending}>
            Save &amp; New
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
