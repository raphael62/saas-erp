"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ProductTemplateMenu } from "@/components/inventory/product-template-menu";
import { ProductTemplateListDialog } from "@/components/inventory/product-template-list-dialog";
import {
  ProductTemplateSettingsDialog,
  type TemplateColumnSetting,
} from "@/components/inventory/product-template-settings-dialog";
import type { ChangeHistoryRow } from "@/app/dashboard/inventory/change-history/actions";
import { ChangeHistoryFilterDialog } from "@/components/inventory/change-history-filter-dialog";
import {
  createListTemplate,
  ensureDefaultListTemplate,
  getListTemplates,
  getTemplateDefinition,
  saveTemplateColumns,
  updateListTemplate,
} from "@/app/dashboard/inventory/actions";

type ChangeHistoryViewProps = {
  rows: ChangeHistoryRow[];
  from: string;
  to: string;
  error?: string;
  includeInactive: boolean;
  excludeNoTransactions: boolean;
  itemQ: string;
  categoryQ: string;
};

const THEAD_STICKY_BG = "color-mix(in oklch, var(--navbar) 15%, white)";
const TFOOT_STICKY_BG = "color-mix(in oklch, var(--muted) 80%, var(--background))";

const MODULE_KEY = "inventory_change_history";
const CHECKBOX_COL_WIDTH = 48;
const ROW_NUMBER_COL_WIDTH = 40;

type ChangeHistoryColumnKey = keyof ChangeHistoryRow;
type SortableChangeHistoryColumn = ChangeHistoryColumnKey;

type NumericTotalKey =
  | "opening"
  | "purchases"
  | "sales"
  | "closing"
  | "orderQty"
  | "costValue"
  | "saleValue";

const TEMPLATE_COLUMN_LABELS: Record<string, string> = {
  productId: "Product ID",
  itemCode: "Item Code",
  itemName: "Item name",
  packUnit: "Pack Unit",
  opening: "Opening",
  purchases: "Purchases",
  sales: "Sales",
  closing: "Closing",
  orderQty: "Order",
  costValue: "Cost Value",
  saleValue: "Sale value",
};

const CHANGE_HISTORY_COLUMNS: Array<{
  key: ChangeHistoryColumnKey;
  label: string;
  sortable?: boolean;
  defaultVisible?: boolean;
  defaultWidth?: number;
  numeric?: boolean;
}> = [
  { key: "productId", label: "Product ID", defaultVisible: false, defaultWidth: 200 },
  { key: "itemCode", label: "Item Code", sortable: true, defaultVisible: true, defaultWidth: 120 },
  { key: "itemName", label: "Item name", sortable: true, defaultVisible: true, defaultWidth: 200 },
  { key: "packUnit", label: "Pack Unit", sortable: true, defaultVisible: true, defaultWidth: 110, numeric: true },
  { key: "opening", label: "Opening", sortable: true, defaultVisible: true, defaultWidth: 100, numeric: true },
  { key: "purchases", label: "Purchases", sortable: true, defaultVisible: true, defaultWidth: 100, numeric: true },
  { key: "sales", label: "Sales", sortable: true, defaultVisible: true, defaultWidth: 100, numeric: true },
  { key: "closing", label: "Closing", sortable: true, defaultVisible: true, defaultWidth: 100, numeric: true },
  { key: "orderQty", label: "Order", sortable: true, defaultVisible: true, defaultWidth: 100, numeric: true },
  { key: "costValue", label: "Cost Value", sortable: true, defaultVisible: true, defaultWidth: 120, numeric: true },
  { key: "saleValue", label: "Sale value", sortable: true, defaultVisible: true, defaultWidth: 120, numeric: true },
];

function defaultTemplateColumns(): TemplateColumnSetting[] {
  return CHANGE_HISTORY_COLUMNS.map((col, index) => ({
    column_key: col.key,
    visible: col.defaultVisible !== false,
    width: col.defaultWidth ?? 120,
    sort_order: col.key === "itemCode" ? 1 : null,
    sort_direction: col.key === "itemCode" ? "asc" : null,
    display_order: index,
  }));
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Proportional UI font (not monospace—clearer 0 vs 8) + tabular + slashed zero when the font supports it. */
const FIGURE_CELL_CLASS = "tabular-nums [font-variant-numeric:slashed-zero_tabular-nums]";

function SortIcon({ direction }: { direction: "asc" | "desc" | null }) {
  if (!direction) return <ChevronDown className="inline h-3 w-3 opacity-50" style={{ color: "var(--navbar)" }} />;
  return direction === "asc" ? (
    <ChevronUp className="inline h-3 w-3" style={{ color: "var(--navbar)" }} />
  ) : (
    <ChevronDown className="inline h-3 w-3" style={{ color: "var(--navbar)" }} />
  );
}

type TemplateMeta = {
  id?: string;
  name: string;
  authorization_user_id?: string | null;
  authorization_group?: string | null;
  is_default?: boolean;
};

type TemplateRow = {
  id: string;
  name: string;
  is_default?: boolean | null;
  authorization_group?: string | null;
};

function compareRows(a: ChangeHistoryRow, b: ChangeHistoryRow, col: SortableChangeHistoryColumn, dir: "asc" | "desc") {
  const av = a[col];
  const bv = b[col];
  const mul = dir === "asc" ? 1 : -1;
  if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
  const cmp =
    av == null && bv == null ? 0 : av == null ? 1 : bv == null ? -1 : String(av).localeCompare(String(bv), undefined, { numeric: true });
  return cmp * mul;
}

export function ChangeHistoryView({
  rows,
  from,
  to,
  error,
  includeInactive,
  excludeNoTransactions,
  itemQ,
  categoryQ,
}: ChangeHistoryViewProps) {
  const [search, setSearch] = useState("");
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showTemplateListDialog, setShowTemplateListDialog] = useState(false);
  const [showTemplateSettingsDialog, setShowTemplateSettingsDialog] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [activeTemplateMeta, setActiveTemplateMeta] = useState<TemplateMeta>({ name: "Default", is_default: true });
  const [templateColumns, setTemplateColumns] = useState<TemplateColumnSetting[]>(defaultTemplateColumns());
  const [templateSaving, setTemplateSaving] = useState(false);
  const [manualSortChanged, setManualSortChanged] = useState(false);
  const [sortCol, setSortCol] = useState<SortableChangeHistoryColumn | null>("itemCode");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const columnMap = useMemo(() => {
    const map = new Map<string, TemplateColumnSetting>();
    for (const col of templateColumns) map.set(col.column_key, col);
    return map;
  }, [templateColumns]);

  const visibleDataColumns = useMemo(() => {
    return CHANGE_HISTORY_COLUMNS.filter((col) => columnMap.get(col.key)?.visible ?? true).sort(
      (a, b) => (columnMap.get(a.key)?.display_order ?? 0) - (columnMap.get(b.key)?.display_order ?? 0)
    );
  }, [columnMap]);

  const tableWidth = useMemo(() => {
    const dataWidth = visibleDataColumns.reduce((sum, col) => {
      const w = columnMap.get(col.key)?.width ?? col.defaultWidth ?? 120;
      return sum + Math.max(60, w);
    }, 0);
    return CHECKBOX_COL_WIDTH + ROW_NUMBER_COL_WIDTH + dataWidth;
  }, [columnMap, visibleDataColumns]);

  const searched = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.itemCode || "").toLowerCase().includes(q) ||
        (r.itemName || "").toLowerCase().includes(q) ||
        String(r.productId || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const filtered = useMemo(() => {
    let list = searched;
    if (sortCol) {
      list = [...list].sort((a, b) => compareRows(a, b, sortCol, sortDir));
    }
    return list;
  }, [searched, sortCol, sortDir]);

  const totals = useMemo(() => {
    const numericKeys: NumericTotalKey[] = [
      "opening",
      "purchases",
      "sales",
      "closing",
      "orderQty",
      "costValue",
      "saleValue",
    ];
    const out = {} as Record<NumericTotalKey, number>;
    for (const k of numericKeys) {
      out[k] = filtered.reduce((sum, r) => sum + (Number(r[k]) || 0), 0);
    }
    return out;
  }, [filtered]);

  const toggleSort = (col: SortableChangeHistoryColumn) => {
    setManualSortChanged(true);
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
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
    if (selectedIds.size === filtered.length && filtered.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((r) => r.productId)));
  };

  async function loadTemplateLists(preferredTemplateId?: string | null) {
    const ensured = await ensureDefaultListTemplate(MODULE_KEY);
    if (ensured?.error) return;
    const result = await getListTemplates(MODULE_KEY);
    if (result?.error) return;
    const tplRows = (result.data ?? []) as TemplateRow[];
    setTemplates(tplRows);
    const defaultId =
      preferredTemplateId ?? tplRows.find((r) => r.is_default)?.id ?? tplRows[0]?.id ?? null;
    if (defaultId) {
      setSelectedTemplateId(defaultId);
      await loadTemplateDefinition(defaultId, !preferredTemplateId);
    }
  }

  async function loadTemplateDefinition(templateId: string, applyTemplateSort = false) {
    const result = await getTemplateDefinition(templateId);
    if (result?.error) return;
    if (!result.data) return;
    setSelectedTemplateId(templateId);
    setActiveTemplateMeta(result.data.template as TemplateMeta);
    const cols = (result.data.columns as TemplateColumnSetting[])?.length
      ? (result.data.columns as TemplateColumnSetting[])
      : defaultTemplateColumns();
    setTemplateColumns(cols);

    const sorted = [...cols]
      .filter((c) => c.sort_direction && c.sort_order !== null)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const topSort = sorted[0];
    if (topSort && (applyTemplateSort || !manualSortChanged)) {
      if (CHANGE_HISTORY_COLUMNS.some((c) => c.key === topSort.column_key)) {
        setSortCol(topSort.column_key as SortableChangeHistoryColumn);
        setSortDir((topSort.sort_direction as "asc" | "desc") ?? "asc");
      }
    }
  }

  useEffect(() => {
    loadTemplateLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F3") return;
      e.preventDefault();
      setShowFilterDialog(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function formatCell(r: ChangeHistoryRow, key: ChangeHistoryColumnKey) {
    const colDef = CHANGE_HISTORY_COLUMNS.find((c) => c.key === key);
    const v = r[key];
    if (typeof v === "number") {
      const text = fmt(v);
      return colDef?.numeric ? <span className={FIGURE_CELL_CLASS}>{text}</span> : text;
    }
    return v ?? "—";
  }

  function totalsLabelColumnKey(): ChangeHistoryColumnKey | null {
    const prefer: ChangeHistoryColumnKey[] = ["itemCode", "itemName", "productId"];
    for (const k of prefer) {
      if (visibleDataColumns.some((c) => c.key === k)) return k;
    }
    return visibleDataColumns[0]?.key ?? null;
  }

  const emptySearch = filtered.length === 0 && rows.length > 0;
  const emptyData = rows.length === 0;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="shrink-0 space-y-3 pb-1">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              id="ch-search"
              type="text"
              placeholder="Quick filter (current list); F3 = criteria"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "F3") {
                  e.preventDefault();
                  setShowFilterDialog(true);
                }
              }}
              className="h-8 w-56 rounded border border-input bg-background px-2.5 text-sm"
            />
            <Button
              size="sm"
              className="text-white"
              style={{ backgroundColor: "var(--navbar)" }}
              type="button"
              onClick={() => setShowFilterDialog(true)}
            >
              Search (F3)
            </Button>
            <div className="relative">
              <Button size="sm" variant="outline" type="button" onClick={() => setShowTemplateMenu((v) => !v)}>
                Option
              </Button>
              <ProductTemplateMenu
                open={showTemplateMenu}
                onClose={() => setShowTemplateMenu(false)}
                onOpenTemplateList={() => setShowTemplateListDialog(true)}
                onOpenTemplateSettings={async () => {
                  if (selectedTemplateId) await loadTemplateDefinition(selectedTemplateId, true);
                  setShowTemplateSettingsDialog(true);
                }}
              />
            </div>
            <Button size="sm" variant="outline" type="button" onClick={() => setShowHelpDialog(true)}>
              Help
            </Button>
          </div>
        </div>

      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          Period: <span className="font-medium text-foreground">{from}</span> –{" "}
          <span className="font-medium text-foreground">{to}</span>
        </span>
        {(itemQ || categoryQ || includeInactive || excludeNoTransactions) && (
          <span className="text-xs text-muted-foreground">
            {includeInactive ? "· Including inactive " : ""}
            {excludeNoTransactions ? "· Hiding no-txn items " : ""}
            {itemQ ? `· Item “${itemQ}” ` : ""}
            {categoryQ ? `· Category “${categoryQ}” ` : ""}
          </span>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setShowFilterDialog(true)}>
          Edit criteria…
        </Button>
      </div>

      {error && (
        <div className="shrink-0 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-border">
        {emptyData && error ? (
          <div className="flex h-48 items-center justify-center px-4 text-center text-muted-foreground">
            Change history did not load. Use the message above, adjust criteria, then retry.
          </div>
        ) : emptyData ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            No products in inventory. Add products to see change history.
          </div>
        ) : emptySearch ? (
          <div className="flex h-48 items-center justify-center px-4 text-center text-muted-foreground">
            No rows match your search. Clear the search box or narrow your terms.
          </div>
        ) : (
          <div className="min-h-0 min-w-0 flex-1 overflow-auto">
            <table
              className="border-separate border-spacing-0 text-sm"
              style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}
            >
              <thead>
                <tr>
                  <th
                    className="sticky top-0 z-20 border-b border-r border-border px-2 py-2 shadow-[0_1px_0_0_var(--border)]"
                    style={{ width: CHECKBOX_COL_WIDTH, minWidth: CHECKBOX_COL_WIDTH, backgroundColor: THEAD_STICKY_BG }}
                  >
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 rounded"
                    />
                  </th>
                  <th
                    className="sticky top-0 z-20 border-b border-r border-border px-2 py-2 text-left font-medium shadow-[0_1px_0_0_var(--border)]"
                    style={{ width: ROW_NUMBER_COL_WIDTH, minWidth: ROW_NUMBER_COL_WIDTH, backgroundColor: THEAD_STICKY_BG }}
                  >
                    #
                  </th>
                  {visibleDataColumns.map((col) => {
                    const w = Math.max(60, columnMap.get(col.key)?.width ?? col.defaultWidth ?? 120);
                    const alignRight = Boolean(col.numeric);
                    return (
                      <th
                        key={col.key}
                        className={`sticky top-0 z-20 border-b border-r border-border px-2 py-2 font-medium shadow-[0_1px_0_0_var(--border)] ${alignRight ? "text-right" : "text-left"}`}
                        style={{ width: w, minWidth: w, backgroundColor: THEAD_STICKY_BG }}
                      >
                        {col.sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(col.key)}
                            className={`flex w-full items-center gap-1 ${alignRight ? "justify-end" : "justify-start"}`}
                          >
                            {col.label} <SortIcon direction={sortCol === col.key ? sortDir : null} />
                          </button>
                        ) : (
                          col.label
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr
                    key={r.productId}
                    className={`border-b border-border ${i % 2 === 0 ? "bg-background" : "bg-muted/30"}`}
                  >
                    <td className="border-r border-border px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.productId)}
                        onChange={() => toggleSelect(r.productId)}
                        className="h-3.5 w-3.5 rounded"
                      />
                    </td>
                    <td className="border-r border-border px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                    {visibleDataColumns.map((col) => {
                      const colWidth = Math.max(60, columnMap.get(col.key)?.width ?? col.defaultWidth ?? 120);
                      const alignRight = Boolean(col.numeric);
                      return (
                        <td
                          key={col.key}
                          className={`border-r border-border px-2 py-1.5 ${alignRight ? "text-right" : ""}`}
                          style={{ width: colWidth, minWidth: colWidth }}
                        >
                          {formatCell(r, col.key)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td
                    className="sticky bottom-0 z-20 border-t-2 border-border border-r px-2 py-2 shadow-[0_-1px_0_0_var(--border)]"
                    style={{ width: CHECKBOX_COL_WIDTH, minWidth: CHECKBOX_COL_WIDTH, backgroundColor: TFOOT_STICKY_BG }}
                  />
                  <td
                    className="sticky bottom-0 z-20 border-t-2 border-border border-r px-2 py-2 text-muted-foreground shadow-[0_-1px_0_0_var(--border)]"
                    style={{ width: ROW_NUMBER_COL_WIDTH, minWidth: ROW_NUMBER_COL_WIDTH, backgroundColor: TFOOT_STICKY_BG }}
                  />
                  {visibleDataColumns.map((col) => {
                    const colWidth = Math.max(60, columnMap.get(col.key)?.width ?? col.defaultWidth ?? 120);
                    const alignRight = Boolean(col.numeric);
                    const labelCol = totalsLabelColumnKey();
                    let content: ReactNode = null;
                    if (col.key === labelCol) content = "Totals";
                    else if (col.key === "packUnit") content = "—";
                    else if (col.numeric) {
                      const sum = totals[col.key as NumericTotalKey];
                      content = <span className={FIGURE_CELL_CLASS}>{fmt(sum)}</span>;
                    }
                    return (
                      <td
                        key={col.key}
                        className={`sticky bottom-0 z-20 border-t-2 border-border border-r px-2 py-2 shadow-[0_-1px_0_0_var(--border)] ${alignRight ? "text-right" : ""}`}
                        style={{ width: colWidth, minWidth: colWidth, backgroundColor: TFOOT_STICKY_BG }}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-3 py-2">
        <Button variant="outline" size="sm" disabled className="opacity-60">
          Excel
        </Button>
        <Button variant="outline" size="sm" disabled className="opacity-60">
          Print
        </Button>
        <span className="text-muted-foreground">|</span>
        <Button variant="outline" size="sm" disabled className="opacity-60">
          Relation Settings
        </Button>
      </div>

      <ChangeHistoryFilterDialog
        open={showFilterDialog}
        onOpenChange={setShowFilterDialog}
        initialFrom={from}
        initialTo={to}
        initialIncludeInactive={includeInactive}
        initialExcludeNoTxn={excludeNoTransactions}
        initialItemQ={itemQ}
        initialCategoryQ={categoryQ}
      />

      <ProductTemplateListDialog
        open={showTemplateListDialog}
        onOpenChange={setShowTemplateListDialog}
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={setSelectedTemplateId}
        onOpenTemplateSettings={async (templateId) => {
          await loadTemplateDefinition(templateId, true);
          setManualSortChanged(false);
          setShowTemplateSettingsDialog(true);
          setShowTemplateListDialog(false);
        }}
        onCreateTemplate={() => {
          setActiveTemplateMeta({
            name: "New Template",
            authorization_group: "",
            authorization_user_id: "",
            is_default: false,
          });
          setTemplateColumns(defaultTemplateColumns());
          setShowTemplateSettingsDialog(true);
        }}
      />

      <ProductTemplateSettingsDialog
        open={showTemplateSettingsDialog}
        onOpenChange={setShowTemplateSettingsDialog}
        template={activeTemplateMeta}
        columns={templateColumns}
        columnLabels={TEMPLATE_COLUMN_LABELS}
        saving={templateSaving}
        onSave={async (meta, columns) => {
          setTemplateSaving(true);
          let templateId = meta.id;
          if (templateId) {
            const updated = await updateListTemplate(templateId, {
              name: meta.name,
              authorization_group: meta.authorization_group ?? null,
              authorization_user_id: meta.authorization_user_id ?? null,
              is_default: Boolean(meta.is_default),
            });
            if (updated?.error) {
              setTemplateSaving(false);
              return;
            }
          } else {
            const created = await createListTemplate({
              module_key: MODULE_KEY,
              name: meta.name,
              authorization_group: meta.authorization_group ?? null,
              authorization_user_id: meta.authorization_user_id ?? null,
              is_default: Boolean(meta.is_default),
            });
            if (created?.error || !created.data?.id) {
              setTemplateSaving(false);
              return;
            }
            templateId = created.data.id as string;
          }

          if (templateId) {
            const savedCols = await saveTemplateColumns(templateId, columns);
            if (!savedCols?.error) {
              setManualSortChanged(false);
              await loadTemplateLists(templateId);
              await loadTemplateDefinition(templateId, true);
              setShowTemplateSettingsDialog(false);
            }
          }
          setTemplateSaving(false);
        }}
      />

      <Dialog
        open={showHelpDialog}
        onOpenChange={setShowHelpDialog}
        title="Change history help"
        showGearIcon={false}
        contentClassName="max-w-lg text-sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">How to use this page:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Use Search (F3) to open criteria (dates, item/category filters, options). Search (F8) runs the query from that panel.</li>
            <li>Quick filter narrows the already-loaded grid only; criteria reload data from the server.</li>
            <li>
              Table header and totals row use sticky positioning so they stay visible while you scroll the list. Pack Unit is not
              totaled.
            </li>
            <li>Option → Template Settings / Template List: column visibility, width, order, and default sort (same as Item List).</li>
            <li>
              Cartons: Opening + Purchases − Sales = Closing. Opening is ledger-based from your go-live date to the day before
              the selected period. Sales counts posted invoices, plus empties dispatch for empties SKUs. Order = Sales − Closing.
            </li>
          </ul>
          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowHelpDialog(false)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
