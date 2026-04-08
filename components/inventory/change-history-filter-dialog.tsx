"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ITEM_CATEGORY_PRESET_LABELS } from "@/lib/inventory-change-history-presets";
import { encodeCsvTerms } from "@/lib/change-history-url-params";
import {
  ErpMultiSelectSearchModal,
  ErpMultiSelectTags,
  ErpMultiSelectTrigger,
  type ErpSearchGridRow,
} from "@/components/inventory/erp-multi-select-search-modal";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

const CATEGORY_OPTIONS = [
  { key: "all", label: "All" },
  { key: "raw_material", label: "Raw Material" },
  { key: "sub_material", label: "Sub Material" },
  { key: "finished_goods", label: "Finished Goods" },
  { key: "merchandise", label: "Merchandise" },
  { key: "intangible_merchandise", label: "Intangible Merchandise" },
] as const;

export type ChangeHistoryFilterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFrom: string;
  initialTo: string;
  initialIncludeInactive: boolean;
  initialExcludeNoTxn: boolean;
  initialItemQ: string;
  initialCategoryQ: string;
  initialItemCatKeys: string[];
  initialIndividualLocation: boolean;
  initialLocationIds: string[];
  initialItemIds: string[];
  initialBrandTerms: string[];
  initialEmptiesTerms: string[];
  locations: Array<{ id: string; code: string; name: string; is_active?: boolean | null }>;
  productsForPicklist: Array<{ id: string; code: string | null; name: string; is_active?: boolean }>;
  categoryOptions: string[];
  emptiesTypeOptions: string[];
};

function buildQuery(params: Record<string, string | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function ChangeHistoryFilterDialog({
  open,
  onOpenChange,
  initialFrom,
  initialTo,
  initialIncludeInactive,
  initialExcludeNoTxn,
  initialItemQ,
  initialCategoryQ,
  initialItemCatKeys,
  initialIndividualLocation,
  initialLocationIds,
  initialItemIds,
  initialBrandTerms,
  initialEmptiesTerms,
  locations,
  productsForPicklist,
  categoryOptions,
  emptiesTypeOptions,
}: ChangeHistoryFilterDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [reportType, setReportType] = useState<"summary" | "daily" | "monthly">("summary");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [locationIds, setLocationIds] = useState<Set<string>>(() => new Set(initialLocationIds));
  const [itemIds, setItemIds] = useState<Set<string>>(() => new Set(initialItemIds));
  const [brandTerms, setBrandTerms] = useState<Set<string>>(() => new Set(initialBrandTerms));
  const [emptiesTerms, setEmptiesTerms] = useState<Set<string>>(() => new Set(initialEmptiesTerms));
  const [locModalOpen, setLocModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [emptiesModalOpen, setEmptiesModalOpen] = useState(false);
  const anyPickModalOpen = locModalOpen || itemModalOpen || brandModalOpen || emptiesModalOpen;
  const [includeInactive, setIncludeInactive] = useState(initialIncludeInactive);
  const [excludeNoTxn, setExcludeNoTxn] = useState(initialExcludeNoTxn);
  const [individualLocation, setIndividualLocation] = useState(initialIndividualLocation);
  const [catAll, setCatAll] = useState(
    () => initialItemCatKeys.length === 0 || initialItemCatKeys.includes("all")
  );
  const [catSelected, setCatSelected] = useState<Set<string>>(() => {
    const s = new Set(initialItemCatKeys.filter((k) => k !== "all"));
    return s;
  });

  const locationGridRows = useMemo<ErpSearchGridRow[]>(
    () =>
      locations.map((l) => ({
        id: l.id,
        typeLabel: "Location",
        cells: [l.code, l.name],
        isInactive: l.is_active === false,
      })),
    [locations]
  );

  const productGridRows = useMemo<ErpSearchGridRow[]>(
    () =>
      productsForPicklist.map((p) => ({
        id: p.id,
        typeLabel: "Item",
        cells: [p.code ?? "", p.name],
        isInactive: p.is_active === false,
      })),
    [productsForPicklist]
  );

  const brandGridRows = useMemo<ErpSearchGridRow[]>(
    () =>
      categoryOptions.map((cat) => ({
        id: cat,
        typeLabel: "Brand Category",
        cells: [cat],
      })),
    [categoryOptions]
  );

  const emptiesGridRows = useMemo<ErpSearchGridRow[]>(
    () =>
      emptiesTypeOptions.map((et) => ({
        id: et,
        typeLabel: "Empties Type",
        cells: [et],
      })),
    [emptiesTypeOptions]
  );

  const sortedLocationIdsForTags = useMemo(() => {
    const byId = new Map(locations.map((l) => [l.id, l]));
    return [...locationIds].sort((a, b) =>
      (byId.get(a)?.name ?? "").localeCompare(byId.get(b)?.name ?? "", undefined, { sensitivity: "base" })
    );
  }, [locationIds, locations]);

  const sortedItemIdsForTags = useMemo(() => {
    const byId = new Map(productsForPicklist.map((p) => [p.id, p]));
    return [...itemIds].sort((a, b) => {
      const pa = byId.get(a);
      const pb = byId.get(b);
      const sa = `${pa?.code ?? ""} ${pa?.name ?? ""}`.trim();
      const sb = `${pb?.code ?? ""} ${pb?.name ?? ""}`.trim();
      return sa.localeCompare(sb, undefined, { sensitivity: "base" });
    });
  }, [itemIds, productsForPicklist]);

  const sortedBrandTermsForTags = useMemo(
    () => [...brandTerms].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [brandTerms]
  );

  const sortedEmptiesTermsForTags = useMemo(
    () => [...emptiesTerms].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [emptiesTerms]
  );

  useEffect(() => {
    if (!open) return;
    setFrom(initialFrom);
    setTo(initialTo);
    setLocationIds(new Set(initialLocationIds));
    setItemIds(new Set(initialItemIds));
    setBrandTerms(new Set(initialBrandTerms));
    setEmptiesTerms(new Set(initialEmptiesTerms));
    setIncludeInactive(initialIncludeInactive);
    setExcludeNoTxn(initialExcludeNoTxn);
    setIndividualLocation(initialIndividualLocation);
    const keys = initialItemCatKeys.filter((k) => k !== "all");
    setCatAll(keys.length === 0);
    setCatSelected(new Set(keys));
  }, [
    open,
    initialFrom,
    initialTo,
    initialLocationIds,
    initialItemIds,
    initialBrandTerms,
    initialEmptiesTerms,
    initialIncludeInactive,
    initialExcludeNoTxn,
    initialIndividualLocation,
    initialItemCatKeys,
  ]);

  const apply = useCallback(() => {
    const itemCatParam =
      catAll || catSelected.size === 0
        ? undefined
        : [...catSelected].filter((k) => k in ITEM_CATEGORY_PRESET_LABELS).join(",");

    const locCsv = locationIds.size > 0 ? [...locationIds].join(",") : undefined;
    const itemCsv = itemIds.size > 0 ? [...itemIds].join(",") : undefined;
    const brandCsv = brandTerms.size > 0 ? encodeCsvTerms([...brandTerms]) : undefined;
    const emptiesCsv = emptiesTerms.size > 0 ? encodeCsvTerms([...emptiesTerms]) : undefined;

    const q = buildQuery({
      from,
      to,
      include_inactive: includeInactive ? "1" : undefined,
      exclude_no_txn: excludeNoTxn ? "1" : undefined,
      item_q: itemIds.size === 0 && initialItemQ.trim() ? initialItemQ.trim() : undefined,
      category_q: itemIds.size === 0 && initialCategoryQ.trim() ? initialCategoryQ.trim() : undefined,
      brand_q: brandCsv,
      empties_q: emptiesCsv,
      item_cat: itemCatParam,
      individual_location: individualLocation ? "1" : undefined,
      location_ids: locCsv,
      item_ids: itemCsv,
    });
    router.push(`${pathname}${q}`);
    onOpenChange(false);
  }, [
    from,
    to,
    locationIds,
    itemIds,
    brandTerms,
    emptiesTerms,
    includeInactive,
    excludeNoTxn,
    initialItemQ,
    initialCategoryQ,
    catAll,
    catSelected,
    individualLocation,
    router,
    pathname,
    onOpenChange,
  ]);

  useEffect(() => {
    if (!open || anyPickModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        apply();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, anyPickModalOpen, apply]);

  function toggleCategory(key: string) {
    if (key === "all") {
      setCatAll(true);
      setCatSelected(new Set());
      return;
    }
    setCatAll(false);
    setCatSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function reset() {
    const t = new Date();
    const start = new Date(t.getFullYear(), t.getMonth(), 1);
    setFrom(iso(start));
    setTo(iso(t));
    setIncludeInactive(true);
    setExcludeNoTxn(false);
    setLocationIds(new Set());
    setItemIds(new Set());
    setBrandTerms(new Set());
    setEmptiesTerms(new Set());
    setIndividualLocation(false);
    setCatAll(true);
    setCatSelected(new Set());
    setReportType("summary");
  }

  const setToday = () => {
    const t = iso(new Date());
    setFrom(t);
    setTo(t);
  };
  const setYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const s = iso(d);
    setFrom(s);
    setTo(s);
  };
  const setThisWeek = () => {
    const t = new Date();
    const start = startOfWeekMonday(t);
    setFrom(iso(start));
    setTo(iso(t));
  };
  const setPrevWeek = () => {
    const t = new Date();
    t.setDate(t.getDate() - 7);
    const start = startOfWeekMonday(t);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    setFrom(iso(start));
    setTo(iso(end));
  };
  const setThisMonth = () => {
    const t = new Date();
    const start = new Date(t.getFullYear(), t.getMonth(), 1);
    setFrom(iso(start));
    setTo(iso(t));
  };
  const setPrevMonth = () => {
    const t = new Date();
    const start = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    const end = new Date(t.getFullYear(), t.getMonth(), 0);
    setFrom(iso(start));
    setTo(iso(end));
  };
  const setPrevMonthPlusCurrent = () => {
    const t = new Date();
    const start = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    setFrom(iso(start));
    setTo(iso(t));
  };
  const setEndDateToday = () => {
    setTo(iso(new Date()));
  };
  const setLastNDays = (n: number) => {
    const t = new Date();
    const fromD = new Date(t);
    fromD.setDate(fromD.getDate() - (n - 1));
    setFrom(iso(fromD));
    setTo(iso(t));
  };
  const setYTD = () => {
    const t = new Date();
    const start = new Date(t.getFullYear(), 0, 1);
    setFrom(iso(start));
    setTo(iso(t));
  };

  const PANEL_CLASS =
    "fixed left-1/2 top-1/2 z-50 box-border w-[560px] max-h-[min(90vh,760px)] max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overflow-x-hidden rounded-md border border-border bg-background shadow-[0_8px_30px_rgb(0_0_0/0.12)]";

  const inlineLabelClass =
    "w-[132px] shrink-0 self-center text-xs font-medium leading-tight text-muted-foreground sm:w-[140px]";
  const inlineLabelTopClass =
    "w-[132px] shrink-0 self-start pt-1.5 text-xs font-medium leading-tight text-muted-foreground sm:w-[140px]";
  const rowClass = "flex min-w-0 flex-row flex-wrap items-center gap-x-2.5 gap-y-1.5";
  const rowStartClass = "flex min-w-0 flex-row flex-wrap items-start gap-x-2.5 gap-y-1.5";
  const inputClass =
    "h-8 w-full min-w-0 rounded border border-input bg-background px-2.5 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/30 focus-visible:ring-offset-2";
  const radioClass = "h-4 w-4 border-muted-foreground/40 text-red-600 accent-red-600 focus-visible:ring-red-600";

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={() => onOpenChange(false)} aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby="ch-filter-title" className={PANEL_CLASS}>
        <div className="border-b border-border bg-muted/40 px-3 py-2">
          <h2 id="ch-filter-title" className="text-sm font-semibold text-foreground">
            Inventory Change History
          </h2>
        </div>
        <div className="space-y-3 p-3 text-sm">
          <section className={rowClass}>
            <span className={inlineLabelClass}>Type</span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="ch-type"
                  checked={reportType === "summary"}
                  onChange={() => setReportType("summary")}
                  className={radioClass}
                />
                <span>Summary</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 opacity-60">
                <input type="radio" name="ch-type" disabled className={radioClass} />
                <span>Daily</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 opacity-60">
                <input type="radio" name="ch-type" disabled className={radioClass} />
                <span>Monthly</span>
              </label>
            </div>
          </section>

          <section className={`${rowClass} min-w-0`}>
            <span className={inlineLabelClass}>Date</span>
            <div className="min-w-0 flex-1">
              <span className="inline-flex max-w-full flex-nowrap items-center gap-1">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className={`${inputClass} box-border w-[8rem] min-w-0 shrink sm:w-[8.5rem]`}
                />
                <span className="shrink-0 text-muted-foreground">~</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className={`${inputClass} box-border w-[8rem] min-w-0 shrink sm:w-[8.5rem]`}
                />
              </span>
            </div>
          </section>

          <section className={rowStartClass}>
            <span className={inlineLabelTopClass}>Location</span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <ErpMultiSelectTrigger
                  placeholder="Search location…"
                  selectedCount={locationIds.size}
                  onOpen={() => setLocModalOpen(true)}
                  ariaLabel="Open location search"
                />
                <ErpMultiSelectTags
                  ids={sortedLocationIdsForTags}
                  getLabel={(id) => locations.find((l) => l.id === id)?.name ?? id}
                  onRemove={(id) => {
                    setLocationIds((prev) => {
                      const next = new Set(prev);
                      next.delete(id);
                      return next;
                    });
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Selection is stored for location-scoped reporting. Full location stock allocation is applied when that
                module is enabled.
              </p>
            </div>
          </section>

          <section className={rowStartClass}>
            <span className={inlineLabelTopClass}>Item</span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <ErpMultiSelectTrigger
                  placeholder="Search item…"
                  selectedCount={itemIds.size}
                  onOpen={() => setItemModalOpen(true)}
                  ariaLabel="Open item search"
                />
                <ErpMultiSelectTags
                  ids={sortedItemIdsForTags}
                  getLabel={(id) => {
                    const p = productsForPicklist.find((x) => x.id === id);
                    if (!p) return id;
                    return p.code ? `${p.code} · ${p.name}` : p.name;
                  }}
                  onRemove={(id) => {
                    setItemIds((prev) => {
                      const next = new Set(prev);
                      next.delete(id);
                      return next;
                    });
                  }}
                />
              </div>
            </div>
          </section>

          <section className={rowStartClass}>
            <span className={inlineLabelTopClass}>Item Category</span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-2">
              {CATEGORY_OPTIONS.map(({ key, label }) => (
                <label key={key} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className={`${radioClass} rounded`}
                    checked={key === "all" ? catAll : !catAll && catSelected.has(key)}
                    onChange={() => toggleCategory(key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className={rowStartClass}>
            <span className={inlineLabelTopClass}>Brand Category</span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <ErpMultiSelectTrigger
                  placeholder="Search brand category…"
                  selectedCount={brandTerms.size}
                  onOpen={() => setBrandModalOpen(true)}
                  ariaLabel="Open brand category search"
                />
                <ErpMultiSelectTags
                  ids={sortedBrandTermsForTags}
                  getLabel={(id) => id}
                  onRemove={(id) => {
                    setBrandTerms((prev) => {
                      const next = new Set(prev);
                      next.delete(id);
                      return next;
                    });
                  }}
                />
              </div>
              {categoryOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">No brand categories on products.</p>
              )}
            </div>
          </section>

          <section className={rowStartClass}>
            <span className={inlineLabelTopClass}>Empties Type</span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <ErpMultiSelectTrigger
                  placeholder="Search empties type…"
                  selectedCount={emptiesTerms.size}
                  onOpen={() => setEmptiesModalOpen(true)}
                  ariaLabel="Open empties type search"
                />
                <ErpMultiSelectTags
                  ids={sortedEmptiesTermsForTags}
                  getLabel={(id) => id}
                  onRemove={(id) => {
                    setEmptiesTerms((prev) => {
                      const next = new Set(prev);
                      next.delete(id);
                      return next;
                    });
                  }}
                />
              </div>
              {emptiesTypeOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">No empties types on products.</p>
              )}
            </div>
          </section>

          <section className={`${rowStartClass} border-t border-border pt-4`}>
            <span className={inlineLabelTopClass}>Others</span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className={`${radioClass} rounded`}
                />
                <span>Include Deactivated Items</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={excludeNoTxn}
                  onChange={(e) => setExcludeNoTxn(e.target.checked)}
                  className={`${radioClass} rounded`}
                />
                <span>Exclude Items without Transactions</span>
              </label>
              <label className="flex min-w-0 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={individualLocation}
                  onChange={(e) => setIndividualLocation(e.target.checked)}
                  className={`${radioClass} rounded`}
                />
                <span>Based on Individual Location</span>
              </label>
            </div>
          </section>

          <div className="flex flex-col gap-2.5 border-t border-border pt-3">
            <Button
              type="button"
              size="default"
              className="h-9 w-full max-w-[200px] bg-red-600 px-4 text-sm text-white hover:bg-red-700"
              onClick={apply}
            >
              <Search className="mr-2 h-3.5 w-3.5" />
              Search (F8)
            </Button>
            <div className="flex flex-wrap items-center gap-1">
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={setToday}>
                Today
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={setYesterday}>
                Yesterday
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={setThisWeek}>
                This Week (~ Today)
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={setPrevWeek}>
                Prev. Week
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={setThisMonth}>
                This Month (~ Today)
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={setPrevMonth}>
                Prev. Month
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={setPrevMonthPlusCurrent}
              >
                Prev. Month + Current Month
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={setEndDateToday}>
                End Date
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLastNDays(14)}>
                14Days
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLastNDays(7)}>
                Last 7 Days
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLastNDays(30)}>
                Last 30 Days
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLastNDays(90)}>
                Last 90 Days
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={setYTD}>
                YTD
              </Button>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" aria-label="Options">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Reset
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ErpMultiSelectSearchModal
        open={locModalOpen}
        onOpenChange={setLocModalOpen}
        title="Search Location"
        columnLabels={["Code", "Location"]}
        rows={locationGridRows}
        selectedIds={locationIds}
        onApply={setLocationIds}
        showIncludeInactive
        includeInactiveDefault
        columnClassNames={["min-w-0 max-w-[4.5rem] w-[4.5rem] truncate", "min-w-0"]}
        panelPlacement="side"
      />
      <ErpMultiSelectSearchModal
        open={itemModalOpen}
        onOpenChange={setItemModalOpen}
        title="Search Item"
        columnLabels={["Code", "Name"]}
        rows={productGridRows}
        selectedIds={itemIds}
        onApply={setItemIds}
        showIncludeInactive
        includeInactiveDefault
        columnClassNames={["min-w-0 max-w-[4.5rem] w-[4.5rem] truncate", "min-w-0"]}
        panelPlacement="side"
      />
      <ErpMultiSelectSearchModal
        open={brandModalOpen}
        onOpenChange={setBrandModalOpen}
        title="Search Brand Category"
        columnLabels={["Category"]}
        rows={brandGridRows}
        selectedIds={brandTerms}
        onApply={setBrandTerms}
        columnClassNames={["min-w-0 truncate"]}
        panelPlacement="side"
      />
      <ErpMultiSelectSearchModal
        open={emptiesModalOpen}
        onOpenChange={setEmptiesModalOpen}
        title="Search Empties Type"
        columnLabels={["Type"]}
        rows={emptiesGridRows}
        selectedIds={emptiesTerms}
        onApply={setEmptiesTerms}
        columnClassNames={["min-w-0 truncate"]}
        panelPlacement="side"
      />
    </>
  );
}
