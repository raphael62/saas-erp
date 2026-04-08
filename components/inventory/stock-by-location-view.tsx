"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, FileSpreadsheet, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  StockByLocationFilterDialog,
  type StockByLocationFilterSnapshot,
} from "@/components/inventory/stock-by-location-filter-dialog";

export type StockByLocationProduct = {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  pack_unit: number | null;
  min_stock: number;
  reorder_qty: number;
  cost_price: number;
  empties_type: string | null;
};

export type StockByLocationBalanceRow = {
  product_id: string;
  location_id: string;
  quantity: number;
};

type Props = {
  products: StockByLocationProduct[];
  locations: Array<{ id: string; code: string; name: string; is_active?: boolean | null }>;
  balances: StockByLocationBalanceRow[];
  productsForPicklist: Array<{ id: string; code: string | null; name: string; is_active?: boolean }>;
  categoryOptions: string[];
  emptiesTypeOptions: string[];
  generatedAtIso: string;
  balancesTableMissing?: boolean;
};

function n(v: unknown) {
  return Number(v ?? 0);
}

function reorderLevel(p: StockByLocationProduct) {
  const rq = n(p.reorder_qty);
  const mn = n(p.min_stock);
  return rq > 0 ? rq : mn;
}

type StockStatus = "out" | "low" | "ok" | "over";

function stockStatus(qty: number, level: number): StockStatus {
  if (qty <= 0) return "out";
  if (level > 0 && qty > level * 2) return "over";
  if (level > 0 && qty <= level) return "low";
  return "ok";
}

function statusLabel(s: StockStatus): string {
  switch (s) {
    case "out":
      return "Out of Stock";
    case "low":
      return "Low Stock";
    case "over":
      return "+ Over";
    default:
      return "OK";
  }
}

function cellTone(s: StockStatus): string {
  switch (s) {
    case "out":
      return "bg-muted/80 text-foreground";
    case "low":
      return "bg-red-100/90 text-red-950 dark:bg-red-950/40 dark:text-red-100";
    case "over":
      return "bg-amber-100/90 text-amber-950 dark:bg-amber-950/35 dark:text-amber-100";
    default:
      return "bg-emerald-100/80 text-emerald-950 dark:bg-emerald-950/35 dark:text-emerald-100";
  }
}

const FIG = "tabular-nums [font-variant-numeric:slashed-zero_tabular-nums]";

type SortKey =
  | "code"
  | "name"
  | "category"
  | "pack_unit"
  | "total"
  | "reorder"
  | "status"
  | `loc:${string}`;

function StockByLocationOptionsMenu({
  open,
  onClose,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-10 z-50 min-w-56 rounded border border-border bg-background p-1 shadow-lg"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm hover:bg-muted"
        onClick={() => {
          onRefresh();
          onClose();
        }}
      >
        <RefreshCw className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        Refresh
      </button>
    </div>
  );
}

function statusSortRank(s: StockStatus): number {
  switch (s) {
    case "out":
      return 0;
    case "low":
      return 1;
    case "ok":
      return 2;
    case "over":
      return 3;
    default:
      return 2;
  }
}

export function StockByLocationView({
  products,
  locations,
  balances,
  productsForPicklist,
  categoryOptions,
  emptiesTypeOptions,
  generatedAtIso,
  balancesTableMissing,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [appliedFilter, setAppliedFilter] = useState<StockByLocationFilterSnapshot>({
    locationIds: [],
    itemIds: [],
    brandTerms: [],
    emptiesTerms: [],
  });

  const balanceMap = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const b of balances) {
      const pid = b.product_id;
      if (!m.has(pid)) m.set(pid, new Map());
      const locMap = m.get(pid)!;
      locMap.set(b.location_id, n(b.quantity));
    }
    return m;
  }, [balances]);

  const qtyAtLocation = useCallback(
    (productId: string, locationId: string) => balanceMap.get(productId)?.get(locationId) ?? 0,
    [balanceMap]
  );

  const sortedLocations = useMemo(
    () =>
      [...locations].sort((a, b) =>
        (a.code ?? "").localeCompare(b.code ?? "", undefined, { numeric: true })
      ),
    [locations]
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q) {
        const code = (p.code ?? "").toLowerCase();
        const name = p.name.toLowerCase();
        if (!code.includes(q) && !name.includes(q)) return false;
      }
      if (appliedFilter.itemIds.length > 0 && !appliedFilter.itemIds.includes(p.id)) return false;
      if (appliedFilter.brandTerms.length > 0) {
        const cat = (p.category ?? "").trim();
        if (!appliedFilter.brandTerms.includes(cat)) return false;
      }
      if (appliedFilter.emptiesTerms.length > 0) {
        const et = (p.empties_type ?? "").trim();
        if (!appliedFilter.emptiesTerms.includes(et)) return false;
      }
      return true;
    });
  }, [products, search, appliedFilter]);

  /** Filter columns by Filter → Location (empty = all sites). */
  const visibleLocations = useMemo(() => {
    if (appliedFilter.locationIds.length === 0) return sortedLocations;
    const selected = new Set(appliedFilter.locationIds);
    const picked = sortedLocations.filter((l) => selected.has(l.id));
    return picked.length > 0 ? picked : sortedLocations;
  }, [sortedLocations, appliedFilter.locationIds]);

  const singleLocationSelected = visibleLocations.length === 1;

  const totalForVisibleColumns = useCallback(
    (productId: string) => {
      let s = 0;
      for (const loc of visibleLocations) {
        s += qtyAtLocation(productId, loc.id);
      }
      return s;
    },
    [visibleLocations, qtyAtLocation]
  );

  const tableColCount = useMemo(
    () => 6 + visibleLocations.length + (singleLocationSelected ? 2 : 0),
    [visibleLocations.length, singleLocationSelected]
  );

  const statusQty = useCallback(
    (p: StockByLocationProduct) => {
      if (visibleLocations.length === 1) {
        return qtyAtLocation(p.id, visibleLocations[0].id);
      }
      return totalForVisibleColumns(p.id);
    },
    [visibleLocations, qtyAtLocation, totalForVisibleColumns]
  );

  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const sortedFilteredProducts = useMemo(() => {
    const rows = [...filteredProducts];
    const mul = sortDir === "asc" ? 1 : -1;
    const levelOf = (p: StockByLocationProduct) => reorderLevel(p);
    const totalDisplayed = (p: StockByLocationProduct) => totalForVisibleColumns(p.id);

    rows.sort((a, b) => {
      let c = 0;
      switch (sortKey) {
        case "code":
          c = String(a.code ?? "").localeCompare(String(b.code ?? ""), undefined, { numeric: true });
          break;
        case "name":
          c = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
          break;
        case "category":
          c = String(a.category ?? "").localeCompare(String(b.category ?? ""), undefined, {
            sensitivity: "base",
          });
          break;
        case "pack_unit":
          c = n(a.pack_unit) - n(b.pack_unit);
          break;
        case "total":
          c = totalDisplayed(a) - totalDisplayed(b);
          break;
        case "reorder":
          c = levelOf(a) - levelOf(b);
          break;
        case "status": {
          const sa = stockStatus(statusQty(a), levelOf(a));
          const sb = stockStatus(statusQty(b), levelOf(b));
          c = statusSortRank(sa) - statusSortRank(sb);
          break;
        }
        default:
          if (sortKey.startsWith("loc:")) {
            const lid = sortKey.slice(4);
            c = qtyAtLocation(a.id, lid) - qtyAtLocation(b.id, lid);
          }
          break;
      }
      if (c !== 0) return c * mul;
      return String(a.code ?? "").localeCompare(String(b.code ?? ""), undefined, { numeric: true });
    });
    return rows;
  }, [filteredProducts, sortKey, sortDir, totalForVisibleColumns, qtyAtLocation, statusQty]);

  useEffect(() => {
    if (!singleLocationSelected && (sortKey === "reorder" || sortKey === "status")) {
      setSortKey("code");
      setSortDir("asc");
    }
  }, [singleLocationSelected, sortKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F3") {
        e.preventDefault();
        setFilterOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Client-only formatting avoids SSR/client locale mismatch (hydration errors). */
  const [lastUpdated, setLastUpdated] = useState("—");
  useEffect(() => {
    try {
      const d = new Date(generatedAtIso);
      if (Number.isNaN(d.getTime())) {
        setLastUpdated("—");
        return;
      }
      setLastUpdated(
        d.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      );
    } catch {
      setLastUpdated("—");
    }
  }, [generatedAtIso]);

  const sidebarStats = useMemo(() => {
    let totalProducts = 0;
    let low = 0;
    let over = 0;
    let invValue = 0;

    for (const p of filteredProducts) {
      const level = reorderLevel(p);
      const qty = totalForVisibleColumns(p.id);
      totalProducts += 1;
      const st = stockStatus(qty, level);
      if (st === "low") low += 1;
      if (st === "over") over += 1;
      const cost = n(p.cost_price);
      invValue += qty * cost;
    }

    return { totalProducts, low, over, invValue };
  }, [filteredProducts, totalForVisibleColumns]);

  const footerTotals = useMemo(() => {
    const locTotals = visibleLocations.map((loc) =>
      sortedFilteredProducts.reduce((sum, p) => sum + qtyAtLocation(p.id, loc.id), 0)
    );
    const grandTotal = sortedFilteredProducts.reduce(
      (sum, p) => sum + totalForVisibleColumns(p.id),
      0
    );
    return { locTotals, grandTotal };
  }, [sortedFilteredProducts, visibleLocations, qtyAtLocation, totalForVisibleColumns]);

  const exportCsv = useCallback(() => {
    const locHeaders = visibleLocations.map((loc) => `${loc.name} (${loc.code ?? "—"})`);
    const headers = [
      "Product Code",
      "Product Name",
      "Category",
      "Pack Unit",
      ...locHeaders,
      "Total Stock",
      ...(singleLocationSelected ? (["Reorder Level", "Status"] as const) : []),
    ];
    const lines = [headers.join(",")];
    for (const p of sortedFilteredProducts) {
      const level = reorderLevel(p);
      const total = totalForVisibleColumns(p.id);
      const locCells = visibleLocations.map((loc) => String(qtyAtLocation(p.id, loc.id)));
      const tail = singleLocationSelected
        ? [String(level), `"${statusLabel(stockStatus(statusQty(p), level))}"`]
        : [];
      lines.push(
        [
          `"${(p.code ?? "").replace(/"/g, '""')}"`,
          `"${p.name.replace(/"/g, '""')}"`,
          `"${(p.category ?? "").replace(/"/g, '""')}"`,
          String(p.pack_unit ?? ""),
          ...locCells,
          String(total),
          ...tail,
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-by-location-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [
    sortedFilteredProducts,
    visibleLocations,
    qtyAtLocation,
    totalForVisibleColumns,
    statusQty,
    singleLocationSelected,
  ]);

  const currency = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "GHS",
        minimumFractionDigits: 2,
      }),
    []
  );

  const headerBgStyle = { background: "color-mix(in oklch, var(--navbar) 12%, white)" } as const;
  const footerBgStyle = { background: "color-mix(in oklch, var(--navbar) 18%, white)" } as const;

  function SortGlyph({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
    if (!active) {
      return <ChevronDown className="inline h-3.5 w-3.5 shrink-0 opacity-35" aria-hidden />;
    }
    return dir === "asc" ? (
      <ChevronUp className="inline h-3.5 w-3.5 shrink-0" style={{ color: "var(--navbar)" }} aria-hidden />
    ) : (
      <ChevronDown className="inline h-3.5 w-3.5 shrink-0" style={{ color: "var(--navbar)" }} aria-hidden />
    );
  }

  function SortHeader({
    label,
    colKey,
    align = "left",
    className,
  }: {
    label: ReactNode;
    colKey: SortKey;
    align?: "left" | "right" | "center";
    className?: string;
  }) {
    const active = sortKey === colKey;
    const alignClass =
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
    return (
      <th
        scope="col"
        className={cn(
          "border border-border px-2 py-2 text-xs font-medium text-muted-foreground",
          alignClass,
          "cursor-pointer select-none hover:bg-muted/40",
          className
        )}
        style={headerBgStyle}
        onClick={() => handleSort(colKey)}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      >
        <span
          className={cn(
            "inline-flex items-center gap-1",
            align === "right" && "w-full justify-end",
            align === "center" && "w-full justify-center"
          )}
        >
          {label}
          <SortGlyph active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <span className="text-foreground">Stock Levels By Location</span>
      </nav>

      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock by Location</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Multi-location stock visibility and management</p>
        </div>
        <p className="text-muted-foreground shrink-0 text-sm">Last updated: {lastUpdated}</p>
      </div>

      {balancesTableMissing && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          Location balances are unavailable. Apply migration{" "}
          <code className="rounded bg-muted px-1">055_inventory_location_balances.sql</code> to enable per-location
          stock.
        </div>
      )}

      <div className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search product code or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "F3") {
                e.preventDefault();
                setFilterOpen(true);
              }
            }}
            className="h-8 w-48 rounded border border-input bg-background px-2.5 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/25 focus-visible:ring-offset-2"
          />
          <Button
            type="button"
            size="sm"
            className="gap-1 text-white"
            style={{ backgroundColor: "var(--navbar)" }}
            onClick={() => setFilterOpen(true)}
          >
            <Search className="h-4 w-4" aria-hidden />
            Search (F3)
          </Button>
          <div className="relative">
            <Button type="button" size="sm" variant="outline" onClick={() => setShowOptionsMenu((v) => !v)}>
              Option
            </Button>
            <StockByLocationOptionsMenu
              open={showOptionsMenu}
              onClose={() => setShowOptionsMenu(false)}
              onRefresh={() => router.refresh()}
            />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setShowHelpDialog(true)}>
            Help
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={exportCsv}
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Excel
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>{sortedFilteredProducts.length} products</span>
          {appliedFilter.locationIds.length > 0 && visibleLocations.length < sortedLocations.length && (
            <span>
              · {visibleLocations.length} of {sortedLocations.length} locations in grid
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="max-h-[calc(100vh-18rem)] overflow-auto rounded-md border border-border">
            <table
              className="w-full border-collapse text-sm"
              style={{
                minWidth: `${Math.max(960, 520 + visibleLocations.length * 80)}px`,
              }}
            >
              <thead className="sticky top-0 z-20 border-b border-border">
                <tr>
                  <th
                    className="w-10 border border-border px-2 py-2 text-center text-xs font-medium text-muted-foreground"
                    style={headerBgStyle}
                    scope="col"
                  >
                    #
                  </th>
                  <SortHeader label="Product Code" colKey="code" />
                  <SortHeader label="Product Name" colKey="name" />
                  <SortHeader label="Category" colKey="category" />
                  <SortHeader label="Pack Unit" colKey="pack_unit" align="right" />
                  {visibleLocations.map((loc) => (
                    <SortHeader
                      key={loc.id}
                      colKey={`loc:${loc.id}`}
                      align="right"
                      className="min-w-[108px] max-w-[160px] align-bottom"
                      label={
                        <span className="block leading-tight">
                          {loc.name}
                          <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                            ({loc.code ?? "—"})
                          </span>
                        </span>
                      }
                    />
                  ))}
                  <SortHeader
                    label={
                      appliedFilter.locationIds.length > 0 && visibleLocations.length < sortedLocations.length
                        ? "Total (shown)"
                        : "Total Stock"
                    }
                    colKey="total"
                    align="right"
                    className="min-w-[100px] font-semibold text-orange-700 dark:text-orange-400"
                  />
                  {singleLocationSelected && (
                    <>
                      <SortHeader label="Reorder Level" colKey="reorder" align="right" className="w-28" />
                      <SortHeader label="Status" colKey="status" />
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedFilteredProducts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tableColCount}
                      className="border border-border px-3 py-8 text-center text-muted-foreground"
                    >
                      No products match your filters.
                    </td>
                  </tr>
                ) : (
                  sortedFilteredProducts.map((p, idx) => {
                    const level = reorderLevel(p);
                    const total = totalForVisibleColumns(p.id);
                    const st = stockStatus(statusQty(p), level);
                    const rowNum = idx + 1;
                    return (
                      <tr
                        key={p.id}
                        className={idx % 2 === 1 ? "bg-muted/15" : undefined}
                      >
                        <td className="border border-border px-2 py-2 text-center text-muted-foreground">
                          {rowNum}
                        </td>
                        <td className="border border-border px-2 py-2">
                          <Link
                            href="/dashboard/inventory/products"
                            className="font-medium hover:underline"
                            style={{ color: "var(--navbar)" }}
                          >
                            {p.code ?? "—"}
                          </Link>
                        </td>
                        <td className="border border-border px-2 py-2">{p.name}</td>
                        <td className="border border-border px-2 py-2 text-muted-foreground">
                          {p.category ?? "—"}
                        </td>
                        <td className={`border border-border px-2 py-2 text-right ${FIG}`}>
                          {p.pack_unit ?? "—"}
                        </td>
                        {visibleLocations.map((loc) => {
                          const q = qtyAtLocation(p.id, loc.id);
                          const stLoc = stockStatus(q, level);
                          return (
                            <td
                              key={loc.id}
                              className={`border border-border px-2 py-2 text-right font-medium ${FIG} ${cellTone(stLoc)}`}
                            >
                              {q.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </td>
                          );
                        })}
                        <td
                          className={`border border-border px-2 py-2 text-right font-semibold text-orange-700 dark:text-orange-400 ${FIG}`}
                        >
                          {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        {singleLocationSelected && (
                          <>
                            <td className={`border border-border px-2 py-2 text-right text-muted-foreground ${FIG}`}>
                              {level.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </td>
                            <td className="border border-border px-2 py-2">
                              <span
                                className={
                                  st === "over"
                                    ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                                    : st === "low"
                                      ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:bg-red-950/40 dark:text-red-200"
                                      : st === "out"
                                        ? "rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                                        : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                                }
                              >
                                {statusLabel(st)}
                              </span>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
              {sortedFilteredProducts.length > 0 && (
                <tfoot className="sticky bottom-0 z-20 border-t-2 border-border">
                  <tr>
                    <td
                      className="border border-border px-2 py-2 text-center text-xs font-semibold text-foreground"
                      style={footerBgStyle}
                    >
                      ∑
                    </td>
                    <td
                      className="border border-border px-2 py-2 text-xs font-semibold text-foreground"
                      style={footerBgStyle}
                      colSpan={3}
                    >
                      Totals
                    </td>
                    <td className="border border-border px-2 py-2 text-right text-muted-foreground" style={footerBgStyle}>
                      —
                    </td>
                    {footerTotals.locTotals.map((sum, i) => (
                      <td
                        key={visibleLocations[i]?.id ?? i}
                        className={`border border-border px-2 py-2 text-right text-sm font-semibold ${FIG} text-foreground`}
                        style={footerBgStyle}
                      >
                        {sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                    ))}
                    <td
                      className={`border border-border px-2 py-2 text-right text-sm font-semibold text-orange-700 dark:text-orange-400 ${FIG}`}
                      style={footerBgStyle}
                    >
                      {footerTotals.grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    {singleLocationSelected && (
                      <>
                        <td className="border border-border px-2 py-2 text-right text-muted-foreground" style={footerBgStyle}>
                          —
                        </td>
                        <td className="border border-border px-2 py-2 text-muted-foreground" style={footerBgStyle}>
                          —
                        </td>
                      </>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <aside className="w-full shrink-0 space-y-4 rounded-lg border border-border bg-card p-4 lg:w-72">
          <h2 className="text-sm font-semibold">All locations</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">Total Products</span>
              <span className="font-medium text-blue-700 dark:text-blue-400">{sidebarStats.totalProducts}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">Low Stock Alerts</span>
              <span className="font-medium text-red-600 dark:text-red-400">{sidebarStats.low}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">Overstock Items</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">{sidebarStats.over}</span>
            </li>
            <li className="flex justify-between gap-2 border-t border-border pt-2">
              <span className="text-muted-foreground">Total Inv. Value</span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                {currency.format(sidebarStats.invValue)}
              </span>
            </li>
          </ul>
          <div className="space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Stock Status Legend</p>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Adequate Stock
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Low Stock
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Overstock
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/50" /> Out of Stock
            </div>
          </div>
          <p className="text-muted-foreground border-t border-border pt-3 text-xs">Updated {lastUpdated}</p>
        </aside>
      </div>

      <StockByLocationFilterDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        snapshot={appliedFilter}
        onApply={setAppliedFilter}
        locations={sortedLocations}
        productsForPicklist={productsForPicklist}
        categoryOptions={categoryOptions}
        emptiesTypeOptions={emptiesTypeOptions}
      />

      <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog} title="Stock by Location Help" showGearIcon={false} contentClassName="max-w-lg text-sm">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">How to use this page:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Use the search field to filter products by code or name (live).</li>
            <li>Press F3 to scroll to the filter panel. Set location, item, brand, and empties filters, then Apply filters.</li>
            <li>Click Excel to download CSV. Option menu has Refresh. Click column headers to sort.</li>
            <li>Product codes link to the item list for editing.</li>
          </ul>
          <div className="flex justify-end pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowHelpDialog(false)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
