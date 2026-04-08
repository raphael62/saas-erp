"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ErpMultiSelectInlineFilter,
  ErpMultiSelectSearchModal,
  ErpMultiSelectTags,
  type ErpSearchGridRow,
} from "@/components/inventory/erp-multi-select-search-modal";

export type StockByLocationFilterSnapshot = {
  locationIds: string[];
  itemIds: string[];
  brandTerms: string[];
  emptiesTerms: string[];
};

export type StockByLocationFilterFormProps = {
  snapshot: StockByLocationFilterSnapshot;
  onApply: (next: StockByLocationFilterSnapshot) => void;
  locations: Array<{ id: string; code: string; name: string; is_active?: boolean | null }>;
  productsForPicklist: Array<{ id: string; code: string | null; name: string; is_active?: boolean }>;
  categoryOptions: string[];
  emptiesTypeOptions: string[];
  /** Anchor id (e.g. scroll target); omit in dialog. */
  id?: string;
  /** Close without applying (dialog Cancel). */
  onCancel?: () => void;
  /** `dialog` matches inventory change history popup chrome. */
  layout?: "card" | "dialog";
};

/** Same centered modal shell as change history filter. */
const FILTER_POPUP_PANEL_CLASS =
  "fixed left-1/2 top-1/2 z-50 box-border w-[min(560px,calc(100vw-1rem))] max-h-[min(90vh,760px)] max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overflow-x-hidden rounded-md border border-border bg-background shadow-[0_8px_30px_rgb(0_0_0/0.12)]";

export type StockByLocationFilterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: StockByLocationFilterSnapshot;
  onApply: (next: StockByLocationFilterSnapshot) => void;
  locations: StockByLocationFilterFormProps["locations"];
  productsForPicklist: StockByLocationFilterFormProps["productsForPicklist"];
  categoryOptions: string[];
  emptiesTypeOptions: string[];
};

export function StockByLocationFilterDialog({
  open,
  onOpenChange,
  snapshot,
  onApply,
  locations,
  productsForPicklist,
  categoryOptions,
  emptiesTypeOptions,
}: StockByLocationFilterDialogProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={() => onOpenChange(false)} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sbl-filter-title"
        className={FILTER_POPUP_PANEL_CLASS}
      >
        <StockByLocationFilterForm
          snapshot={snapshot}
          onApply={(next) => {
            onApply(next);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          locations={locations}
          productsForPicklist={productsForPicklist}
          categoryOptions={categoryOptions}
          emptiesTypeOptions={emptiesTypeOptions}
          layout="dialog"
        />
      </div>
    </>
  );
}

export function StockByLocationFilterForm({
  snapshot,
  onApply,
  locations,
  productsForPicklist,
  categoryOptions,
  emptiesTypeOptions,
  id = "stock-by-location-filter",
  onCancel,
  layout = "card",
}: StockByLocationFilterFormProps) {
  const [locationIds, setLocationIds] = useState<Set<string>>(() => new Set(snapshot.locationIds));
  const [itemIds, setItemIds] = useState<Set<string>>(() => new Set(snapshot.itemIds));
  const [brandTerms, setBrandTerms] = useState<Set<string>>(() => new Set(snapshot.brandTerms));
  const [emptiesTerms, setEmptiesTerms] = useState<Set<string>>(() => new Set(snapshot.emptiesTerms));

  const [locModalOpen, setLocModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [emptiesModalOpen, setEmptiesModalOpen] = useState(false);

  useEffect(() => {
    setLocationIds(new Set(snapshot.locationIds));
    setItemIds(new Set(snapshot.itemIds));
    setBrandTerms(new Set(snapshot.brandTerms));
    setEmptiesTerms(new Set(snapshot.emptiesTerms));
  }, [
    snapshot.locationIds.join("|"),
    snapshot.itemIds.join("|"),
    snapshot.brandTerms.join("|"),
    snapshot.emptiesTerms.join("|"),
  ]);

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

  const apply = useCallback(() => {
    onApply({
      locationIds: [...locationIds],
      itemIds: [...itemIds],
      brandTerms: [...brandTerms],
      emptiesTerms: [...emptiesTerms],
    });
  }, [locationIds, itemIds, brandTerms, emptiesTerms, onApply]);

  const reset = useCallback(() => {
    setLocationIds(new Set());
    setItemIds(new Set());
    setBrandTerms(new Set());
    setEmptiesTerms(new Set());
  }, []);

  const rowStart = "flex min-w-0 flex-row flex-wrap items-start gap-x-2.5 gap-y-1.5";
  const label =
    "w-[72px] shrink-0 self-start pt-1.5 text-xs font-medium leading-tight text-muted-foreground sm:w-[88px]";

  const isDialog = layout === "dialog";

  return (
    <>
      <div id={isDialog ? undefined : id} className="space-y-3 text-sm">
        <div
          className={
            isDialog
              ? "border-b border-border bg-muted/40 px-3 py-2"
              : "border-b border-border bg-muted/30 px-3 py-2 sm:rounded-t-md"
          }
        >
          <h2 id="sbl-filter-title" className="text-sm font-semibold text-foreground">
            Filter stock
          </h2>
          <p className="text-xs text-muted-foreground">
            Item, brand, and empties filters limit which products appear. Location picks which sites show as columns
            when all sites are shown—leave empty to show every site.
          </p>
        </div>
        <div className="space-y-3 px-3 pb-3">
          <section className={rowStart}>
            <span className={label}>Location</span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs text-muted-foreground">
                Column visibility when multiple locations exist. No selection = all columns.
              </p>
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <ErpMultiSelectInlineFilter
                  placeholder="Type location code or name…"
                  ariaLabel="Filter locations by code or name"
                  rows={locationGridRows.map((r) => ({
                    id: r.id,
                    cells: r.cells,
                    isInactive: r.isInactive,
                  }))}
                  selectedIds={locationIds}
                  onApply={setLocationIds}
                  showIncludeInactive
                  includeInactiveDefault
                  onOpenGrid={() => setLocModalOpen(true)}
                />
                <ErpMultiSelectTags
                  ids={sortedLocationIdsForTags}
                  getLabel={(id) => locations.find((l) => l.id === id)?.name ?? id}
                  onRemove={(id) =>
                    setLocationIds((prev) => {
                      const n = new Set(prev);
                      n.delete(id);
                      return n;
                    })
                  }
                />
              </div>
            </div>
          </section>

          <section className={rowStart}>
            <span className={label}>Item</span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <ErpMultiSelectInlineFilter
                  placeholder="Type item code or name…"
                  ariaLabel="Filter items by code or name"
                  rows={productGridRows.map((r) => ({
                    id: r.id,
                    cells: r.cells,
                    isInactive: r.isInactive,
                  }))}
                  selectedIds={itemIds}
                  onApply={setItemIds}
                  showIncludeInactive
                  includeInactiveDefault
                  onOpenGrid={() => setItemModalOpen(true)}
                />
                <ErpMultiSelectTags
                  ids={sortedItemIdsForTags}
                  getLabel={(id) => {
                    const p = productsForPicklist.find((x) => x.id === id);
                    if (!p) return id;
                    return p.code ? `${p.code} · ${p.name}` : p.name;
                  }}
                  onRemove={(id) =>
                    setItemIds((prev) => {
                      const n = new Set(prev);
                      n.delete(id);
                      return n;
                    })
                  }
                />
              </div>
            </div>
          </section>

          <section className={rowStart}>
            <span className={label}>Brand Category</span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <ErpMultiSelectInlineFilter
                  placeholder="Type category name…"
                  ariaLabel="Filter brand categories"
                  rows={brandGridRows.map((r) => ({ id: r.id, cells: r.cells }))}
                  selectedIds={brandTerms}
                  onApply={setBrandTerms}
                  onOpenGrid={() => setBrandModalOpen(true)}
                />
                <ErpMultiSelectTags
                  ids={sortedBrandTermsForTags}
                  getLabel={(id) => id}
                  onRemove={(id) =>
                    setBrandTerms((prev) => {
                      const n = new Set(prev);
                      n.delete(id);
                      return n;
                    })
                  }
                />
              </div>
            </div>
          </section>

          <section className={rowStart}>
            <span className={label}>Empties Type</span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <ErpMultiSelectInlineFilter
                  placeholder="Type empties type…"
                  ariaLabel="Filter empties types"
                  rows={emptiesGridRows.map((r) => ({ id: r.id, cells: r.cells }))}
                  selectedIds={emptiesTerms}
                  onApply={setEmptiesTerms}
                  onOpenGrid={() => setEmptiesModalOpen(true)}
                />
                <ErpMultiSelectTags
                  ids={sortedEmptiesTermsForTags}
                  getLabel={(id) => id}
                  onRemove={(id) =>
                    setEmptiesTerms((prev) => {
                      const n = new Set(prev);
                      n.delete(id);
                      return n;
                    })
                  }
                />
              </div>
            </div>
          </section>

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button
              type="button"
              size="sm"
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={apply}
            >
              Apply filters
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              Reset
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
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
