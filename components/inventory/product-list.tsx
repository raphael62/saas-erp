"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ProductFormDialog } from "@/components/inventory/product-form-dialog";
import { ProductTemplateMenu } from "@/components/inventory/product-template-menu";
import { ProductTemplateListDialog } from "@/components/inventory/product-template-list-dialog";
import {
  ProductTemplateSettingsDialog,
  type TemplateColumnSetting,
} from "@/components/inventory/product-template-settings-dialog";
import {
  createListTemplate,
  deleteProduct,
  ensureDefaultListTemplate,
  getListTemplates,
  getTemplateDefinition,
  saveTemplateColumns,
  updateListTemplate,
} from "@/app/dashboard/inventory/actions";

type Product = {
  id: string;
  organization_id?: string | null;
  name: string;
  sku: string | null;
  code?: string | null;
  description?: string | null;
  category?: string | null;
  unit?: string | null;
  pack_unit?: number | null;
  empties_type?: string | null;
  plastic_cost?: number | null;
  bottle_cost?: number | null;
  reorder_qty?: number | null;
  barcode?: string | null;
  supplier_id?: string | null;
  stock_quantity?: number | null;
  min_stock?: number | null;
  taxable?: boolean;
  returnable?: boolean;
  is_active?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type ProductListProps = {
  products: Product[];
  categories: { id: string; code?: string; name: string }[];
  units: { id: string; code?: string; name: string }[];
  suppliers: { id: string; name: string }[];
  emptiesTypes: { id: string; code?: string; name: string }[];
};

type SortableProductColumn = keyof Product;
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

const MODULE_KEY = "inventory_products";
const PAGE_SIZE = 25;
const PAGE_BUTTONS = 10;
const CHECKBOX_COL_WIDTH = 48;
const ROW_NUMBER_COL_WIDTH = 40;
const PRODUCT_COLUMNS: Array<{
  key: keyof Product;
  label: string;
  sortable?: boolean;
  defaultVisible?: boolean;
  defaultWidth?: number;
}> = [
  { key: "id", label: "ID", defaultVisible: false, defaultWidth: 170 },
  { key: "code", label: "Item Code", sortable: true, defaultVisible: true, defaultWidth: 120 },
  { key: "name", label: "Item Name", sortable: true, defaultVisible: true, defaultWidth: 180 },
  { key: "sku", label: "SKU", sortable: true, defaultVisible: true, defaultWidth: 140 },
  { key: "description", label: "Description", defaultVisible: false, defaultWidth: 220 },
  { key: "category", label: "BrandCategoryName", sortable: true, defaultVisible: true, defaultWidth: 180 },
  { key: "unit", label: "Unit", sortable: true, defaultVisible: true, defaultWidth: 120 },
  { key: "pack_unit", label: "Pack Unit", sortable: true, defaultVisible: true, defaultWidth: 110 },
  { key: "empties_type", label: "EmpTypeName", defaultVisible: true, defaultWidth: 150 },
  { key: "plastic_cost", label: "Plastic Cost", sortable: true, defaultVisible: false, defaultWidth: 120 },
  { key: "bottle_cost", label: "Bottle Cost", sortable: true, defaultVisible: false, defaultWidth: 120 },
  { key: "reorder_qty", label: "Reorder Qty", sortable: true, defaultVisible: false, defaultWidth: 120 },
  { key: "barcode", label: "Barcode", defaultVisible: false, defaultWidth: 160 },
  { key: "supplier_id", label: "Supplier", defaultVisible: false, defaultWidth: 180 },
  { key: "stock_quantity", label: "Stock Qty", sortable: true, defaultVisible: true, defaultWidth: 120 },
  { key: "min_stock", label: "Reorder Level", sortable: true, defaultVisible: true, defaultWidth: 120 },
  { key: "taxable", label: "TaxStatus", defaultVisible: true, defaultWidth: 110 },
  { key: "returnable", label: "Returnable", defaultVisible: true, defaultWidth: 110 },
  { key: "is_active", label: "Active", sortable: true, defaultVisible: true, defaultWidth: 100 },
  { key: "created_at", label: "Created At", sortable: true, defaultVisible: false, defaultWidth: 180 },
  { key: "updated_at", label: "Updated At", sortable: true, defaultVisible: false, defaultWidth: 180 },
  { key: "organization_id", label: "Organization", defaultVisible: false, defaultWidth: 170 },
];

function defaultTemplateColumns(): TemplateColumnSetting[] {
  return PRODUCT_COLUMNS.map((col, index) => ({
    column_key: col.key,
    visible: col.defaultVisible !== false,
    width: col.defaultWidth ?? (col.key === "name" ? 180 : 120),
    sort_order: col.key === "name" ? 1 : null,
    sort_direction: col.key === "name" ? "asc" : null,
    display_order: index,
  }));
}

function SortIcon({ direction }: { direction: "asc" | "desc" | null }) {
  if (!direction) return <ChevronDown className="h-3 w-3 inline opacity-50" style={{ color: "var(--navbar)" }} />;
  return direction === "asc" ? (
    <ChevronUp className="h-3 w-3 inline" style={{ color: "var(--navbar)" }} />
  ) : (
    <ChevronDown className="h-3 w-3 inline" style={{ color: "var(--navbar)" }} />
  );
}

export function ProductList({
  products,
  categories,
  units,
  suppliers,
  emptiesTypes,
}: ProductListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showDialog, setShowDialog] = useState(searchParams.get("add") === "1");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [includeDeactivated, setIncludeDeactivated] = useState(false);
  const [sortCol, setSortCol] = useState<SortableProductColumn | null>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showTemplateListDialog, setShowTemplateListDialog] = useState(false);
  const [showTemplateSettingsDialog, setShowTemplateSettingsDialog] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [activeTemplateMeta, setActiveTemplateMeta] = useState<TemplateMeta>({ name: "Default", is_default: true });
  const [templateColumns, setTemplateColumns] = useState<TemplateColumnSetting[]>(defaultTemplateColumns());
  const [templateSaving, setTemplateSaving] = useState(false);
  const [manualSortChanged, setManualSortChanged] = useState(false);

  const columnMap = useMemo(() => {
    const map = new Map<string, TemplateColumnSetting>();
    for (const col of templateColumns) map.set(col.column_key, col);
    return map;
  }, [templateColumns]);

  const visibleDataColumns = useMemo(() => {
    return PRODUCT_COLUMNS
      .filter((col) => (columnMap.get(col.key)?.visible ?? true))
      .sort((a, b) => (columnMap.get(a.key)?.display_order ?? 0) - (columnMap.get(b.key)?.display_order ?? 0));
  }, [columnMap]);

  const tableWidth = useMemo(() => {
    const dataWidth = visibleDataColumns.reduce((sum, col) => {
      const w = columnMap.get(col.key)?.width ?? col.defaultWidth ?? 120;
      return sum + Math.max(60, w);
    }, 0);
    return CHECKBOX_COL_WIDTH + ROW_NUMBER_COL_WIDTH + dataWidth;
  }, [columnMap, visibleDataColumns]);

  const filtered = useMemo(() => {
    let list = products;
    if (!includeDeactivated) {
      list = list.filter((p) => (p as Product & { is_active?: boolean }).is_active !== false);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((p) =>
        Object.values(p).some((value) => String(value ?? "").toLowerCase().includes(q))
      );
    }
    if (sortCol) {
      list = [...list].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortCol];
        const bv = (b as Record<string, unknown>)[sortCol];
        const cmp = av == null && bv == null ? 0 : av == null ? 1 : bv == null ? -1 : String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [products, includeDeactivated, search, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (col: SortableProductColumn) => {
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
    if (selectedIds.size === paginated.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginated.map((p) => p.id)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        setEditingProduct(null);
        setShowDialog(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function loadTemplateLists(preferredTemplateId?: string | null) {
    const ensured = await ensureDefaultListTemplate(MODULE_KEY);
    if (ensured?.error) return;
    const result = await getListTemplates(MODULE_KEY);
    if (result?.error) return;
    const rows = (result.data ?? []) as TemplateRow[];
    setTemplates(rows);
    const defaultId = preferredTemplateId
      ?? rows.find((r) => r.is_default)?.id
      ?? rows[0]?.id
      ?? null;
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
      if (PRODUCT_COLUMNS.some((c) => c.key === topSort.column_key)) {
        setSortCol(topSort.column_key as keyof Product);
        setSortDir((topSort.sort_direction as "asc" | "desc") ?? "asc");
      }
    }
  }

  useEffect(() => {
    loadTemplateLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatUnit = (p: Product) => {
    const pu = p.pack_unit;
    const u = p.unit || "";
    return pu != null && pu > 0 ? `${pu} ${u}` : u || "—";
  };

  const formatCellValue = (p: Product, key: keyof Product) => {
    if (key === "code") {
      return (
        <button
          type="button"
          className="text-left text-[var(--navbar)] hover:underline"
          onClick={() => {
            setEditingProduct(p);
            setShowDialog(true);
          }}
        >
          {p.code ?? p.sku ?? "—"}
        </button>
      );
    }
    if (key === "name") {
      return (
        <button
          type="button"
          className="text-left text-[var(--navbar)] hover:underline"
          onClick={() => {
            setEditingProduct(p);
            setShowDialog(true);
          }}
        >
          {p.name}
        </button>
      );
    }
    if (key === "unit") return formatUnit(p);
    if (key === "taxable") return p.taxable ? "Taxable" : "—";
    if (key === "returnable") return p.returnable ? "Yes" : "No";
    if (key === "is_active") return p.is_active !== false ? "YES" : "NO";
    if (key === "created_at" || key === "updated_at") {
      const v = p[key];
      if (!v) return "—";
      const date = new Date(String(v));
      return Number.isNaN(date.getTime()) ? String(v) : date.toLocaleString();
    }
    const value = p[key];
    if (typeof value === "number") return value.toFixed(key.includes("cost") ? 2 : 0);
    return value ?? "—";
  };

  return (
    <div className="flex min-h-[400px] flex-col">
      {/* Header */}
      <div className="space-y-3 pb-3">
        <h1 className="text-xl font-semibold">Item List</h1>
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
              onKeyDown={(e) => e.key === "F3" && e.preventDefault()}
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
            <div className="relative">
              <Button size="sm" variant="outline" onClick={() => setShowTemplateMenu((v) => !v)}>
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
            <Button size="sm" variant="outline" onClick={() => setShowHelpDialog(true)}>
              Help
            </Button>
          </div>
        </div>

        {/* Pagination */}
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

      {/* Grid */}
      <div className="max-h-[calc(100vh-18rem)] overflow-auto rounded border border-border">
        {filtered.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            No products. Add one using New (F2).
          </div>
        ) : (
          <table
            className="text-sm"
            style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}
          >
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
                {visibleDataColumns.map((col) => (
                  <th
                    key={col.key}
                    className="border-b border-r border-border px-2 py-2 text-left font-medium"
                    style={{
                      width: Math.max(60, columnMap.get(col.key)?.width ?? col.defaultWidth ?? 120),
                      minWidth: Math.max(60, columnMap.get(col.key)?.width ?? col.defaultWidth ?? 120),
                    }}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key as SortableProductColumn)}
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
              {paginated.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/30"}`}
                >
                  <td className="border-r border-border px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="h-3.5 w-3.5 rounded"
                    />
                  </td>
                  <td className="border-r border-border px-2 py-1.5 text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  {visibleDataColumns.map((col) => {
                    const colWidth = Math.max(60, columnMap.get(col.key)?.width ?? col.defaultWidth ?? 120);
                    return (
                      <td
                        key={col.key}
                        className="border-r border-border px-2 py-1.5"
                        style={{ width: colWidth, minWidth: colWidth }}
                      >
                        {formatCellValue(p, col.key)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bottom action bar */}
      <div
        className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-3 py-2"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingProduct(null);
            setShowDialog(true);
          }}
          style={{ color: "var(--navbar)", borderColor: "var(--navbar)" }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New (F2)
        </Button>
        <span className="text-muted-foreground">|</span>
        <Button variant="outline" size="sm" disabled className="opacity-60">
          Barcode
        </Button>
        <Button variant="outline" size="sm" disabled className="opacity-60">
          Relation Settings
        </Button>
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

      <ProductFormDialog
        key={editingProduct?.id ?? "new-product"}
        open={showDialog}
        onOpenChange={(next) => {
          setShowDialog(next);
          if (!next) setEditingProduct(null);
        }}
        categories={categories}
        units={units}
        suppliers={suppliers}
        emptiesTypes={emptiesTypes}
        initialProduct={editingProduct}
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

      <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog} title="Item List Help" showGearIcon={false} contentClassName="max-w-lg text-sm">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">How to use this page:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Click Item Code or Item Name to edit a product.</li>
            <li>Press F2 to create a new product.</li>
            <li>Use Search (F3) and column sorting to find records quickly.</li>
            <li>Use Include Deactivated to show inactive items.</li>
          </ul>
          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowHelpDialog(false)}>Close</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
