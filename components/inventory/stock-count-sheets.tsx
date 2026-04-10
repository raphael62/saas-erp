"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  deleteStockCountSheet,
  getSuggestedStockCountSheetNo,
  saveStockCountSheet,
  type SaveStockCountSheetInput,
} from "@/app/dashboard/inventory/stock-count-sheets/actions";
import {
  TransferStyleLineItemsTable,
  blankTransferLines,
  type TransferStyleLine,
} from "@/components/inventory/transfer-style-line-items";

type Location = { id: string; code?: string | null; name: string };
type Product = {
  id: string;
  code?: string | null;
  name: string;
  stock_quantity?: number | null;
  unit?: string | null;
  pack_unit?: number | null;
};

type CountLine = TransferStyleLine & {
  id?: string;
  stock_count_sheet_id?: string;
  product?: { id: string; code?: string | null; name: string; pack_unit?: number | null } | null;
};

type StockCountSheet = {
  id: string;
  sheet_no: string;
  count_date: string;
  location_id: string;
  notes?: string | null;
  location?: { id: string; code?: string | null; name: string } | null;
  lines?: CountLine[];
};

function locationLabel(l: Location | { code?: string | null; name: string }) {
  const code = String(l.code ?? "").trim();
  const name = String(l.name ?? "").trim();
  return code ? `${code} - ${name}` : name;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function csvCell(s: string) {
  return `"${String(s).replace(/"/g, '""')}"`;
}

type LocationBalanceRow = {
  product_id: string;
  location_id: string;
  quantity: number | string | null;
};

type StockCountSheetsProps = {
  sheets: StockCountSheet[];
  locations: Location[];
  products: Product[];
  tableMissing?: boolean;
  /** When set, line item picker filters to products with stock at the selected location (or lines already on the sheet). */
  locationBalances?: LocationBalanceRow[];
  /** Map stock count sheet id → persisted stock check id (after save). */
  stockCheckIdBySheetId?: Record<string, string>;
};

export function StockCountSheets({
  sheets = [],
  locations = [],
  products = [],
  tableMissing = false,
  locationBalances = [],
  stockCheckIdBySheetId = {},
}: StockCountSheetsProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return sheets.filter((s) => {
      if (!q) return true;
      return (
        String(s.sheet_no ?? "").toLowerCase().includes(q) ||
        String(s.location?.name ?? "").toLowerCase().includes(q) ||
        String(s.location?.code ?? "").toLowerCase().includes(q)
      );
    });
  }, [sheets, search]);

  const selected = filtered.find((x) => x.id === selectedId) ?? null;
  const editing = sheets.find((x) => x.id === editingId) ?? null;

  async function handleDelete() {
    if (!selected) return;
    if (!confirm("Delete this stock count sheet?")) return;
    const res = await deleteStockCountSheet(selected.id);
    if ("error" in res) {
      setMessage(res.error ?? "Unknown error");
      return;
    }
    setMessage("Stock count sheet deleted.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stock Count Sheets</h1>
          <p className="text-sm text-muted-foreground">Record physical counts at a location using the same line layout as stock transfers.</p>
        </div>
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
          New Sheet
        </Button>
      </div>

      {tableMissing && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Stock count tables are missing. Apply <code className="rounded bg-muted px-1">supabase/migrations/056_stock_count_sheets.sql</code>.
        </p>
      )}
      {message && <p className="rounded border border-border bg-muted/30 px-3 py-1.5 text-sm">{message}</p>}

      <div className="grid gap-2 rounded border border-border bg-card p-2">
        <input
          type="text"
          placeholder="Search by sheet #, location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
        />
      </div>

      <div className="max-h-[calc(100vh-18rem)] overflow-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead
            className="sticky top-0 z-10"
            style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 12%, white)" }}
          >
            <tr>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium">Sheet #</th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium">Count Date</th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium">Location</th>
              <th className="border-b border-r border-border px-2 py-2 text-right font-medium">Items</th>
              <th className="border-b border-border px-2 py-2 text-left font-medium">Stock check</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No stock count sheets found.
                </td>
              </tr>
            ) : (
              filtered.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-b border-border last:border-0 ${
                    selectedId === row.id
                      ? "bg-muted/60"
                      : idx % 2 === 0
                        ? "bg-background hover:bg-muted/20"
                        : "bg-muted/30 hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="border-r border-border px-2 py-1.5">
                    <button
                      type="button"
                      className="text-[var(--navbar)] hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(row.id);
                        setShowForm(true);
                      }}
                    >
                      {row.sheet_no}
                    </button>
                  </td>
                  <td className="border-r border-border px-2 py-1.5">{String(row.count_date).slice(0, 10)}</td>
                  <td className="border-r border-border px-2 py-1.5">
                    {locationLabel(row.location ?? { name: "—" })}
                  </td>
                  <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">{row.lines?.length ?? 0}</td>
                  <td className="px-2 py-1.5">
                    {stockCheckIdBySheetId[row.id] ? (
                      <Link
                        href={`/dashboard/inventory/stock-checks/${stockCheckIdBySheetId[row.id]}`}
                        className="text-[var(--navbar)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Stock check
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
        <Button size="sm" variant="outline" disabled={!selected} onClick={handleDelete}>
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>

      <StockCountSheetFormDialog
        open={showForm}
        onOpenChange={(next) => {
          setShowForm(next);
          if (!next) setEditingId(null);
        }}
        locations={locations}
        products={products}
        locationBalances={locationBalances}
        initialSheet={editing}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

function StockCountSheetFormDialog({
  open,
  onOpenChange,
  locations,
  products,
  locationBalances,
  initialSheet,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: Location[];
  products: Product[];
  locationBalances: LocationBalanceRow[];
  initialSheet: StockCountSheet | null;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetNo, setSheetNo] = useState("");
  const [countDate, setCountDate] = useState(new Date().toISOString().slice(0, 10));
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferStyleLine[]>(() => blankTransferLines(3));

  const hasPerLocationInventory = locationBalances.length > 0;

  const productsForLocation = useMemo(() => {
    const lineIds = new Set(lines.map((l) => String(l.product_id ?? "").trim()).filter(Boolean));
    if (!locationId) return products;
    if (!hasPerLocationInventory) return products;

    const withStock = new Set(
      locationBalances
        .filter(
          (b) =>
            String(b.location_id) === String(locationId) && Number(b.quantity ?? 0) > 0
        )
        .map((b) => String(b.product_id))
    );

    return products.filter((p) => withStock.has(String(p.id)) || lineIds.has(String(p.id)));
  }, [products, locationBalances, locationId, lines, hasPerLocationInventory]);

  const productById = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const initDate = String(initialSheet?.count_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    setCountDate(initDate);
    setLocationId(String(initialSheet?.location_id ?? ""));
    setNotes(String(initialSheet?.notes ?? ""));
    setSheetNo(String(initialSheet?.sheet_no ?? ""));
    const seeded = (initialSheet?.lines ?? []).map((l, i) => {
      const c = Number(l.cartons ?? 0);
      const b = Number(l.bottles ?? 0);
      return {
        product_id: String(l.product_id ?? ""),
        cartons: c === 0 ? null : c,
        bottles: b === 0 ? null : b,
        ctn_qty: Number(l.ctn_qty ?? 0),
        notes: String(l.notes ?? ""),
        row_no: i + 1,
      };
    });
    setLines(seeded.length ? seeded : blankTransferLines(3));
  }, [open, initialSheet]);

  useEffect(() => {
    if (!open || initialSheet?.id) return;
    let alive = true;
    void (async () => {
      const res = await getSuggestedStockCountSheetNo(countDate);
      if (!alive || "error" in res) return;
      setSheetNo(res.sheet_no);
    })();
    return () => {
      alive = false;
    };
  }, [open, initialSheet?.id, countDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const payload: SaveStockCountSheetInput = {
      id: initialSheet?.id,
      count_date: countDate,
      location_id: locationId,
      notes,
      lines: lines.map((l, i) => ({
        product_id: l.product_id,
        cartons: Number(l.cartons ?? 0),
        bottles: Number(l.bottles ?? 0),
        ctn_qty: Number(l.ctn_qty ?? 0),
        notes: String(l.notes ?? ""),
        row_no: i + 1,
      })),
    };

    const res = await saveStockCountSheet(payload);
    setPending(false);
    if ("error" in res) {
      setError(res.error ?? "Unknown error");
      return;
    }
    onOpenChange(false);
    onSaved();
  }

  function handlePrint() {
    const loc = locations.find((l) => String(l.id) === String(locationId));
    const locName = loc ? locationLabel(loc) : "—";
    const rows = lines
      .map((l, i) => {
        const p = l.product_id ? productById.get(String(l.product_id)) : undefined;
        return `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(String(p?.code ?? ""))}</td>
          <td>${escapeHtml(String(p?.name ?? ""))}</td>
          <td class="num">${l.cartons ?? ""}</td>
          <td class="num">${l.bottles ?? ""}</td>
          <td class="num">${l.ctn_qty ?? ""}</td>
          <td>${escapeHtml(String(l.notes ?? ""))}</td>
        </tr>`;
      })
      .join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Stock count ${escapeHtml(sheetNo)}</title>
<style>
body{font-family:system-ui,sans-serif;padding:16px;font-size:12px;}
table{border-collapse:collapse;width:100%;}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}
th{background:#f5f5f5;}
td.num{text-align:right;}
.meta{margin-bottom:12px;line-height:1.5;}
h1{font-size:1.1rem;margin:0 0 8px;}
</style></head><body>
<h1>Stock count sheet</h1>
<div class="meta">
<div><strong>Sheet #</strong> ${escapeHtml(sheetNo)}</div>
<div><strong>Count date</strong> ${escapeHtml(countDate)}</div>
<div><strong>Location</strong> ${escapeHtml(locName)}</div>
${notes ? `<div><strong>Notes</strong> ${escapeHtml(notes)}</div>` : ""}
</div>
<table>
<thead><tr><th>#</th><th>Code</th><th>Product</th><th>Cartons</th><th>Bottles</th><th>Ctn qty</th><th>Line notes</th></tr></thead>
<tbody>${rows || `<tr><td colspan="7">No rows</td></tr>`}</tbody>
</table>
<script>window.addEventListener("load",function(){window.print();});</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  function handleExcel() {
    const loc = locations.find((l) => String(l.id) === String(locationId));
    const locName = loc ? locationLabel(loc) : "";
    const safeSheet = (sheetNo || "sheet").replace(/[/\\?%*:|"<>]/g, "-");
    const csvLines = [
      ["Sheet #", csvCell(sheetNo)].join(","),
      ["Count date", csvCell(countDate)].join(","),
      ["Location", csvCell(locName)].join(","),
      ["Notes", csvCell(notes)].join(","),
      "",
      ["Row", "Code", "Name", "Cartons", "Bottles", "Ctn qty", "Notes"].join(","),
      ...lines.map((l, i) => {
        const p = l.product_id ? productById.get(String(l.product_id)) : undefined;
        return [
          String(i + 1),
          csvCell(String(p?.code ?? "")),
          csvCell(String(p?.name ?? "")),
          l.cartons === null || l.cartons === undefined ? "" : String(l.cartons),
          l.bottles === null || l.bottles === undefined ? "" : String(l.bottles),
          String(l.ctn_qty ?? ""),
          csvCell(String(l.notes ?? "")),
        ].join(",");
      }),
    ];
    const blob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-count-${safeSheet}-${countDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialSheet ? "Edit Stock Count Sheet" : "New Stock Count Sheet"}
      contentClassName="max-w-5xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Location</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              required
              className="h-9 w-full rounded border border-input bg-background px-2.5 text-sm"
            >
              <option value="">Select location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {locationLabel(l)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Count Date</label>
            <input
              type="date"
              value={countDate}
              onChange={(e) => setCountDate(e.target.value)}
              required
              className="h-9 w-full rounded border border-input bg-background px-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Sheet #</label>
            <input type="text" value={sheetNo} readOnly className="h-9 w-full rounded border border-input bg-muted/50 px-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              className="h-9 w-full rounded border border-input bg-background px-2.5 text-sm"
            />
          </div>
        </div>

        {hasPerLocationInventory && locationId && productsForLocation.length === 0 && (
          <p className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-sm text-amber-900">
            No stock recorded at this location yet. Add balances in Stock by Location, or pick products already on this sheet.
          </p>
        )}

        <TransferStyleLineItemsTable
          products={productsForLocation}
          lines={lines}
          onLinesChange={setLines}
          minRowsWhenEmpty={3}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button type="button" variant="outline" onClick={handleExcel}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
          </div>
          <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={pending}
            style={{ backgroundColor: "var(--navbar)" }}
            className="text-white hover:opacity-90"
          >
            {pending ? "Saving…" : initialSheet ? "Update Sheet" : "Create Sheet"}
          </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
