"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type TemplateColumnSetting = {
  column_key: string;
  visible: boolean;
  width: number | null;
  sort_order: number | null;
  sort_direction: "asc" | "desc" | null;
  display_order: number;
};

type TemplateMeta = {
  id?: string;
  name: string;
  authorization_user_id?: string | null;
  authorization_group?: string | null;
  is_default?: boolean;
};

type ProductTemplateSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: TemplateMeta;
  columns: TemplateColumnSetting[];
  onSave: (meta: TemplateMeta, columns: TemplateColumnSetting[]) => Promise<void>;
  saving?: boolean;
  /** Merged with built-in product column labels (e.g. other list modules). */
  columnLabels?: Record<string, string>;
};

const COLUMN_LABELS: Record<string, string> = {
  id: "ID",
  code: "Item Code",
  name: "Item Name",
  sku: "SKU",
  description: "Description",
  unit: "Unit",
  category: "BrandCategoryName",
  empties_type: "EmpTypeName",
  pack_unit: "Pack Unit",
  plastic_cost: "Plastic Cost",
  bottle_cost: "Bottle Cost",
  reorder_qty: "Reorder Qty",
  barcode: "Barcode",
  supplier_id: "Supplier",
  stock_quantity: "Stock Qty",
  min_stock: "Reorder Level",
  taxable: "TaxStatus",
  returnable: "Returnable",
  is_active: "Active",
  organization_id: "Organization",
  created_at: "Created At",
  updated_at: "Updated At",
};

export function ProductTemplateSettingsDialog({
  open,
  onOpenChange,
  template,
  columns,
  onSave,
  saving = false,
  columnLabels,
}: ProductTemplateSettingsDialogProps) {
  const [name, setName] = useState("");
  const [authorizationUserId, setAuthorizationUserId] = useState("");
  const [authorizationGroup, setAuthorizationGroup] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [workingColumns, setWorkingColumns] = useState<TemplateColumnSetting[]>([]);
  const [error, setError] = useState<string | null>(null);

  const orderedColumns = useMemo(
    () => [...workingColumns].sort((a, b) => a.display_order - b.display_order),
    [workingColumns]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(template.name ?? "");
    setAuthorizationUserId(template.authorization_user_id ?? "");
    setAuthorizationGroup(template.authorization_group ?? "");
    setIsDefault(Boolean(template.is_default));
    setWorkingColumns(columns);
  }, [open, template, columns]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Template Settings" showGearIcon={false} contentClassName="max-w-4xl text-sm">
      <div className="space-y-4">
        {error && <p className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--navbar)" }}>Template Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
              placeholder="Template name"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--navbar)" }}>Authorization by User</label>
            <input
              value={authorizationUserId}
              onChange={(e) => setAuthorizationUserId(e.target.value)}
              className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
              placeholder="User ID (optional)"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--navbar)" }}>Authorization by User Group</label>
            <input
              value={authorizationGroup}
              onChange={(e) => setAuthorizationGroup(e.target.value)}
              className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
              placeholder="Group name (optional)"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              <span style={{ color: "var(--navbar)" }}>Default Template</span>
            </label>
          </div>
        </div>

        <div className="max-h-80 overflow-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="px-2 py-2 text-left font-medium">Column</th>
                <th className="px-2 py-2 text-left font-medium">Visible</th>
                <th className="px-2 py-2 text-left font-medium">Width</th>
                <th className="px-2 py-2 text-left font-medium">Sort Direction</th>
                <th className="px-2 py-2 text-left font-medium">Sort Order</th>
                <th className="px-2 py-2 text-left font-medium">Display Order</th>
              </tr>
            </thead>
            <tbody>
              {orderedColumns.map((col) => (
                <tr key={col.column_key} className="border-t border-border">
                  <td className="px-2 py-2">
                    {columnLabels?.[col.column_key] ?? COLUMN_LABELS[col.column_key] ?? col.column_key}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded"
                      checked={col.visible}
                      onChange={(e) =>
                        setWorkingColumns((prev) =>
                          prev.map((p) => (p.column_key === col.column_key ? { ...p, visible: e.target.checked } : p))
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min="60"
                      className="h-8 w-24 rounded border border-input bg-background px-2 text-sm"
                      value={col.width ?? ""}
                      onChange={(e) =>
                        setWorkingColumns((prev) =>
                          prev.map((p) =>
                            p.column_key === col.column_key ? { ...p, width: e.target.value ? Number(e.target.value) : null } : p
                          )
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="h-8 w-24 rounded border border-input bg-background px-2 text-sm"
                      value={col.sort_direction ?? ""}
                      onChange={(e) =>
                        setWorkingColumns((prev) =>
                          prev.map((p) =>
                            p.column_key === col.column_key
                              ? { ...p, sort_direction: (e.target.value || null) as "asc" | "desc" | null }
                              : p
                          )
                        )
                      }
                    >
                      <option value="">None</option>
                      <option value="asc">Asc</option>
                      <option value="desc">Desc</option>
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min="1"
                      className="h-8 w-20 rounded border border-input bg-background px-2 text-sm"
                      value={col.sort_order ?? ""}
                      onChange={(e) =>
                        setWorkingColumns((prev) =>
                          prev.map((p) =>
                            p.column_key === col.column_key
                              ? { ...p, sort_order: e.target.value ? Number(e.target.value) : null }
                              : p
                          )
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min="0"
                      className="h-8 w-20 rounded border border-input bg-background px-2 text-sm"
                      value={col.display_order}
                      onChange={(e) =>
                        setWorkingColumns((prev) =>
                          prev.map((p) =>
                            p.column_key === col.column_key
                              ? { ...p, display_order: e.target.value ? Number(e.target.value) : 0 }
                              : p
                          )
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            size="sm"
            disabled={saving}
            className="text-white"
            style={{ backgroundColor: "var(--navbar)" }}
            onClick={async () => {
              if (!name.trim()) {
                setError("Template name is required.");
                return;
              }
              setError(null);
              await onSave(
                {
                  ...template,
                  name: name.trim(),
                  authorization_user_id: authorizationUserId.trim() || null,
                  authorization_group: authorizationGroup.trim() || null,
                  is_default: isDefault,
                },
                workingColumns
              );
            }}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

