"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Edit,
  FileSpreadsheet,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  deletePriceList,
  importPriceListItemsCsvToSelected,
} from "@/app/dashboard/sales/price-list/actions";
import { PriceListFormDialog } from "@/components/sales/price-list-form-dialog";
import { parseCsv, parseNumber, type CsvRow } from "@/lib/csv";

type Product = {
  id: string | number;
  code?: string | null;
  name: string;
  category?: string | null;
  pack_unit?: number | null;
  unit?: string | null;
  is_active?: boolean;
};

type PriceType = { id: string; code?: string | null; name: string };

type PriceListHeader = {
  id: string;
  name: string;
  price_type_id: string;
  effective_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  is_active?: boolean;
  created_at?: string | null;
  price_types?: { id: string; code?: string | null; name: string } | null;
};

type PriceListItem = {
  id: string;
  price_list_id: string;
  product_id: string;
  price: number;
  tax_rate: number;
  vat_type: string;
};

type ImportStep = 1 | 2 | 3 | 4;

type RequiredImportField =
  | "product_code"
  | "product_name"
  | "price_tax_inc"
  | "tax_rate"
  | "vat_type";

const REQUIRED_FIELDS: RequiredImportField[] = [
  "product_code",
  "product_name",
  "price_tax_inc",
  "tax_rate",
  "vat_type",
];

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

type ReviewRow = {
  rowNo: number;
  mapped: Record<RequiredImportField, string>;
  valid: boolean;
  errors: string[];
};

function validateMappedRow(row: Record<RequiredImportField, string>) {
  const normalizedVat = row.vat_type.trim().toLowerCase();
  const errors: string[] = [];
  if (!row.product_code.trim() && !row.product_name.trim()) {
    errors.push("product_code or product_name is required");
  }
  const price = parseNumber(row.price_tax_inc, Number.NaN);
  if (!Number.isFinite(price) || price < 0) {
    errors.push("price_tax_inc must be a valid number");
  }
  const tax = parseNumber(row.tax_rate, Number.NaN);
  if (!Number.isFinite(tax) || tax < 0) {
    errors.push("tax_rate must be a valid number");
  }
  if (!normalizedVat || !["inc", "exc"].includes(normalizedVat)) {
    errors.push("vat_type must be inc or exc");
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function PriceList({
  products = [],
  priceTypes = [],
  priceLists = [],
  priceListItems = [],
}: {
  products: Product[];
  priceTypes: PriceType[];
  priceLists: PriceListHeader[];
  priceListItems: PriceListItem[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterTypeId, setFilterTypeId] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState<"name" | "price_type" | "effective_date" | "expiry_date" | "item_count" | "created_at">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [importPending, setImportPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showSelectWarning, setShowSelectWarning] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStep, setImportStep] = useState<ImportStep>(1);
  const [parsedRows, setParsedRows] = useState<CsvRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [columnMap, setColumnMap] = useState<Record<RequiredImportField, string>>({
    product_code: "product_code",
    product_name: "product_name",
    price_tax_inc: "price_tax_inc",
    tax_rate: "tax_rate",
    vat_type: "vat_type",
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    return priceLists.filter((row) => {
      if (filterTypeId !== "all" && row.price_type_id !== filterTypeId) return false;
      if (fromDate && row.effective_date && row.effective_date < fromDate) return false;
      if (toDate && row.effective_date && row.effective_date > toDate) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const ptName = row.price_types?.name?.toLowerCase() ?? "";
        if (
          !row.name.toLowerCase().includes(q) &&
          !ptName.includes(q) &&
          !(row.effective_date ?? "").toLowerCase().includes(q) &&
          !(row.expiry_date ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [priceLists, filterTypeId, fromDate, toDate, search]);

  const lineMap = useMemo(() => {
    const map = new Map<string, Record<string, { price: number; tax_rate: number; vat_type: string }>>();
    for (const line of priceListItems) {
      if (!map.has(line.price_list_id)) map.set(line.price_list_id, {});
      map.get(line.price_list_id)![String(line.product_id)] = {
        price: line.price,
        tax_rate: line.tax_rate,
        vat_type: line.vat_type || "inc",
      };
    }
    return map;
  }, [priceListItems]);

  const tableRows = useMemo(() => {
    const rows = filtered.map((row) => ({
      ...row,
      itemCount: Object.keys(lineMap.get(row.id) ?? {}).length,
      priceTypeName: row.price_types?.name ?? "",
    }));
    rows.sort((a, b) => {
      const av =
        sortCol === "name"
          ? a.name
          : sortCol === "price_type"
            ? a.priceTypeName
            : sortCol === "effective_date"
              ? a.effective_date ?? ""
              : sortCol === "expiry_date"
                ? a.expiry_date ?? ""
                : sortCol === "item_count"
                  ? String(a.itemCount)
                  : a.created_at ?? "";
      const bv =
        sortCol === "name"
          ? b.name
          : sortCol === "price_type"
            ? b.priceTypeName
            : sortCol === "effective_date"
              ? b.effective_date ?? ""
              : sortCol === "expiry_date"
                ? b.expiry_date ?? ""
                : sortCol === "item_count"
                  ? String(b.itemCount)
                  : b.created_at ?? "";
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filtered, lineMap, sortCol, sortDir]);

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE));
  const paginatedRows = tableRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const selected = tableRows.find((r) => r.id === selectedId) ?? null;
  const editing = tableRows.find((r) => r.id === editingId) ?? priceLists.find((r) => r.id === editingId) ?? null;

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortCol(col);
    setSortDir("asc");
  };

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

  const mappedRows = useMemo(() => {
    return parsedRows.map((row, index) => {
      const mapped: Record<RequiredImportField, string> = {
        product_code: row[columnMap.product_code] ?? "",
        product_name: row[columnMap.product_name] ?? "",
        price_tax_inc: row[columnMap.price_tax_inc] ?? "",
        tax_rate: row[columnMap.tax_rate] ?? "",
        vat_type: row[columnMap.vat_type] ?? "",
      };
      const result = validateMappedRow(mapped);

      return {
        rowNo: index + 2,
        mapped,
        valid: result.valid,
        errors: result.errors,
      };
    });
  }, [parsedRows, columnMap]);

  const activeRows = reviewRows.length > 0 ? reviewRows : mappedRows;
  const validMappedRows = useMemo(() => activeRows.filter((r) => r.valid), [activeRows]);

  function resetImportWizard() {
    setImportStep(1);
    setImportFile(null);
    setParsedRows([]);
    setCsvHeaders([]);
    setReviewRows([]);
    setColumnMap({
      product_code: "product_code",
      product_name: "product_name",
      price_tax_inc: "price_tax_inc",
      tax_rate: "tax_rate",
      vat_type: "vat_type",
    });
  }

  function syncReviewRowsFromMappedRows() {
    const next: ReviewRow[] = mappedRows.map((row) => ({
      rowNo: row.rowNo,
      mapped: {
        product_code: row.mapped.product_code,
        product_name: row.mapped.product_name,
        price_tax_inc: row.mapped.price_tax_inc,
        tax_rate: row.mapped.tax_rate,
        vat_type: row.mapped.vat_type,
      },
      valid: row.valid,
      errors: row.errors,
    }));
    setReviewRows(next);
  }

  function updateReviewRow(index: number, field: RequiredImportField, value: string) {
    setReviewRows((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const mapped = { ...current.mapped, [field]: value };
      const validation = validateMappedRow(mapped);
      next[index] = {
        ...current,
        mapped,
        valid: validation.valid,
        errors: validation.errors,
      };
      return next;
    });
  }

  async function parseSelectedFile(file: File) {
    const text = await file.text();
    const rows = parseCsv(text);
    setParsedRows(rows);
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    setCsvHeaders(headers);

    // Auto-map exact/normalized headers when possible.
    setColumnMap((prev) => {
      const next = { ...prev };
      for (const field of REQUIRED_FIELDS) {
        const exact = headers.find((h) => h === field);
        if (exact) {
          next[field] = exact;
          continue;
        }
        const normalizedMatch = headers.find((h) => normalizeHeader(h) === field);
        if (normalizedMatch) next[field] = normalizedMatch;
      }
      return next;
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this price list?")) return;
    const result = await deletePriceList(id);
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    setMessage("Deleted successfully.");
    setSelectedId(null);
    router.refresh();
  }

  async function handleImportSelectedList() {
    if (!selected) {
      setShowSelectWarning(true);
      return;
    }
    if (!importFile) {
      setMessage("Choose a CSV file first.");
      return;
    }
    if (validMappedRows.length === 0) {
      setMessage("No valid rows to import.");
      return;
    }

    setMessage(null);
    setImportPending(true);

    const csvLines = ["product_code,product_name,price_tax_inc,tax_rate,vat_type"];
    for (const row of validMappedRows) {
      const c0 = `"${String(row.mapped.product_code || "").replace(/"/g, '""')}"`;
      const c1 = `"${String(row.mapped.product_name || "").replace(/"/g, '""')}"`;
      const c2 = `"${String(row.mapped.price_tax_inc || "").replace(/"/g, '""')}"`;
      const c3 = `"${String(row.mapped.tax_rate || "").replace(/"/g, '""')}"`;
      const c4 = `"${String(row.mapped.vat_type || "").replace(/"/g, '""')}"`;
      csvLines.push([c0, c1, c2, c3, c4].join(","));
    }
    const csvBlob = new Blob([csvLines.join("\n")], { type: "text/csv" });
    const normalizedFile = new File([csvBlob], "price-list-items.csv", {
      type: "text/csv",
    });

    const fd = new FormData();
    fd.set("file", normalizedFile);
    fd.set("price_list_id", selected.id);
    const result = await importPriceListItemsCsvToSelected(fd);
    setImportPending(false);
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    setShowImportDialog(false);
    resetImportWizard();
    setMessage(`Imported ${result?.count ?? 0} line items into ${selected.name}.`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">Price List Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage pricing structures and customer-specific price lists.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search price list, type, or date"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="h-8 w-72 rounded border border-input bg-background px-2.5 text-sm"
        />
        <select
          value={filterTypeId}
          onChange={(e) => {
            setFilterTypeId(e.target.value);
            setPage(1);
          }}
          className="h-8 rounded border border-input bg-background px-2 text-xs"
        >
          <option value="all">All Price Types</option>
          {priceTypes.map((pt) => (
            <option key={pt.id} value={pt.id}>
              {(pt.code ? `${pt.code} - ` : "") + pt.name}
            </option>
          ))}
        </select>
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
                <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("name")}>
                  Price List Name <SortIcon active={sortCol === "name"} />
                </button>
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("price_type")}>
                  Price Type <SortIcon active={sortCol === "price_type"} />
                </button>
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("effective_date")}>
                  Effective Date <SortIcon active={sortCol === "effective_date"} />
                </button>
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("expiry_date")}>
                  Expiry Date <SortIcon active={sortCol === "expiry_date"} />
                </button>
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("item_count")}>
                  No. of Items <SortIcon active={sortCol === "item_count"} />
                </button>
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("created_at")}>
                  Created At <SortIcon active={sortCol === "created_at"} />
                </button>
              </th>
              <th className="border-b border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  No price lists found.
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, i) => {
                const active = selectedId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={`cursor-pointer border-b border-border last:border-0 ${
                      active ? "bg-muted/60" : i % 2 === 0 ? "bg-background hover:bg-muted/20" : "bg-muted/30 hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="border-r border-border px-2 py-2">{row.name}</td>
                    <td className="border-r border-border px-2 py-2">{row.priceTypeName || "—"}</td>
                    <td className="border-r border-border px-2 py-2">{row.effective_date ?? "—"}</td>
                    <td className="border-r border-border px-2 py-2">{row.expiry_date ?? "—"}</td>
                    <td className="border-r border-border px-2 py-2">{row.itemCount}</td>
                    <td className="border-r border-border px-2 py-2">
                      {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(row.id);
                            setShowForm(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(row.id);
                          }}
                        >
                          Del
                        </Button>
                      </div>
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
          Showing {(page - 1) * PAGE_SIZE + (paginatedRows.length ? 1 : 0)}-
          {(page - 1) * PAGE_SIZE + paginatedRows.length} of {tableRows.length}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </Button>
          <span>Page {page} / {totalPages}</span>
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
          <Edit className="h-4 w-4" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!selected}
          onClick={() => selected && handleDelete(selected.id)}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (!selected) {
              setShowSelectWarning(true);
              return;
            }
            resetImportWizard();
            setShowImportDialog(true);
          }}
        >
          <Upload className="h-4 w-4" />
          Import CSV
        </Button>
        <Button size="sm" variant="outline" disabled>
          <FileSpreadsheet className="h-4 w-4" />
          Excel
        </Button>
      </div>

      <PriceListFormDialog
        open={showForm}
        onOpenChange={(next) => {
          setShowForm(next);
          if (!next) setEditingId(null);
        }}
        onSaved={() => router.refresh()}
        products={products}
        priceTypes={priceTypes}
        initialPriceList={editing}
        initialLines={editing ? lineMap.get(editing.id) ?? {} : {}}
      />

      <Dialog
        open={showSelectWarning}
        onOpenChange={setShowSelectWarning}
        title="Import CSV"
        showGearIcon={false}
        contentClassName="max-w-xl"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-[var(--navbar)]" />
            <p>Please select a price list first, then click Import CSV to add items to it.</p>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => setShowSelectWarning(false)}
              style={{ backgroundColor: "#2e7d32" }}
              className="text-white"
            >
              OK
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={showImportDialog}
        onOpenChange={(next) => {
          setShowImportDialog(next);
          if (!next) resetImportWizard();
        }}
        title={`Import CSV — Price List Items -> ${selected?.name ?? ""}`}
        showGearIcon={false}
        contentClassName="max-w-2xl"
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-4 border-b border-border pb-2 text-xs">
            <span className={importStep === 1 ? "font-semibold text-[var(--navbar)]" : "text-muted-foreground"}>
              1) Upload File
            </span>
            <span className={importStep === 2 ? "font-semibold text-[var(--navbar)]" : "text-muted-foreground"}>
              2) Map Columns
            </span>
            <span className={importStep === 3 ? "font-semibold text-[var(--navbar)]" : "text-muted-foreground"}>
              3) Validate
            </span>
            <span className={importStep === 4 ? "font-semibold text-[var(--navbar)]" : "text-muted-foreground"}>
              4) Import
            </span>
          </div>

          {importStep === 1 && (
            <div className="space-y-3">
              <div
                className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded border border-dashed border-border bg-muted/20"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-sm">{importFile ? importFile.name : "Drag & drop or click to upload"}</p>
                <p className="text-xs text-muted-foreground">Support .csv files only</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImportFile(file);
                  await parseSelectedFile(file);
                }}
              />

              <div className="space-y-2 rounded border border-border p-3">
                <p className="text-xs font-medium">Required CSV columns:</p>
                <div className="flex flex-wrap gap-1 text-xs">
                  {REQUIRED_FIELDS.map((col) => (
                    <span key={col} className="rounded border border-border bg-muted/40 px-2 py-0.5">
                      {col}
                    </span>
                  ))}
                </div>
                <Button size="sm" variant="outline" asChild>
                  <a href="/import-templates/price-list-template.csv" download>
                    Download Template
                  </a>
                </Button>
              </div>
            </div>
          )}

          {importStep === 2 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Map each required field to a CSV column.
              </p>
              <div className="rounded border border-border">
                {REQUIRED_FIELDS.map((field) => (
                  <div key={field} className="grid grid-cols-[12rem_1fr] items-center gap-2 border-b border-border p-2 last:border-b-0">
                    <label className="text-xs font-medium">{field}</label>
                    <select
                      value={columnMap[field]}
                      onChange={(e) =>
                        setColumnMap((prev) => ({ ...prev, [field]: e.target.value }))
                      }
                      className="h-8 rounded border border-input bg-background px-2 text-xs"
                    >
                      <option value="">-- Select column --</option>
                      {csvHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {importStep === 3 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Valid rows: {validMappedRows.length} / {activeRows.length}
              </p>
              <div className="max-h-56 overflow-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="border-b border-r border-border px-2 py-1 text-left">Row</th>
                      <th className="border-b border-r border-border px-2 py-1 text-left">Code</th>
                      <th className="border-b border-r border-border px-2 py-1 text-left">Name</th>
                      <th className="border-b border-r border-border px-2 py-1 text-left">Product</th>
                      <th className="border-b border-r border-border px-2 py-1 text-right">Price</th>
                      <th className="border-b border-r border-border px-2 py-1 text-right">Tax</th>
                      <th className="border-b border-r border-border px-2 py-1 text-left">VAT</th>
                      <th className="border-b border-border px-2 py-1 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRows.slice(0, 50).map((row, index) => (
                      <tr key={row.rowNo} className="border-b border-border last:border-b-0">
                        <td className="border-r border-border px-2 py-1">{row.rowNo}</td>
                        <td className="border-r border-border px-1 py-0.5">
                          <input
                            value={row.mapped.product_code}
                            onChange={(e) => updateReviewRow(index, "product_code", e.target.value)}
                            className="h-7 w-full rounded border border-input bg-background px-1.5 text-xs"
                          />
                        </td>
                        <td className="border-r border-border px-1 py-0.5">
                          <input
                            value={row.mapped.product_name}
                            onChange={(e) => updateReviewRow(index, "product_name", e.target.value)}
                            className="h-7 w-full rounded border border-input bg-background px-1.5 text-xs"
                          />
                        </td>
                        <td className="border-r border-border px-2 py-1">
                          {row.mapped.product_code || row.mapped.product_name || "—"}
                        </td>
                        <td className="border-r border-border px-1 py-0.5">
                          <input
                            value={row.mapped.price_tax_inc}
                            onChange={(e) => updateReviewRow(index, "price_tax_inc", e.target.value)}
                            className="h-7 w-full rounded border border-input bg-background px-1.5 text-right text-xs"
                          />
                        </td>
                        <td className="border-r border-border px-1 py-0.5">
                          <input
                            value={row.mapped.tax_rate}
                            onChange={(e) => updateReviewRow(index, "tax_rate", e.target.value)}
                            className="h-7 w-full rounded border border-input bg-background px-1.5 text-right text-xs"
                          />
                        </td>
                        <td className="border-r border-border px-1 py-0.5">
                          <select
                            value={row.mapped.vat_type}
                            onChange={(e) => updateReviewRow(index, "vat_type", e.target.value)}
                            className="h-7 w-full rounded border border-input bg-background px-1.5 text-xs"
                          >
                            <option value="inc">inc</option>
                            <option value="exc">exc</option>
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          {row.valid ? (
                            <span className="text-green-700">Valid</span>
                          ) : (
                            <span className="text-red-600">{row.errors[0]}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importStep === 4 && (
            <div className="space-y-2 rounded border border-border p-3 text-sm">
              <p>
                Ready to import <strong>{validMappedRows.length}</strong> valid line items into{" "}
                <strong>{selected?.name}</strong>.
              </p>
              <p className="text-xs text-muted-foreground">
                Invalid rows will be ignored.
              </p>
            </div>
          )}

          <div className="flex justify-between border-t border-border pt-2">
            <Button
              size="sm"
              variant="outline"
              disabled={importStep === 1}
              onClick={() => setImportStep((s) => Math.max(1, s - 1) as ImportStep)}
            >
              Back
            </Button>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowImportDialog(false)}>
                Cancel
              </Button>
              {importStep < 4 ? (
                <Button
                  size="sm"
                  style={{ backgroundColor: "var(--navbar)" }}
                  className="text-white"
                  onClick={() => {
                    if (importStep === 1 && !importFile) {
                      setMessage("Choose a CSV file first.");
                      return;
                    }
                    if (
                      importStep === 2 &&
                      REQUIRED_FIELDS.some((field) => !columnMap[field])
                    ) {
                      setMessage("Map all required columns before continuing.");
                      return;
                    }
                    if (importStep === 2) {
                      syncReviewRowsFromMappedRows();
                    }
                    setImportStep((s) => Math.min(4, s + 1) as ImportStep);
                  }}
                >
                  Next
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={importPending || validMappedRows.length === 0}
                  style={{ backgroundColor: "var(--navbar)" }}
                  className="text-white"
                  onClick={handleImportSelectedList}
                >
                  {importPending ? "Importing..." : "Import"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
