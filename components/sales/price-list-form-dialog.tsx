"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { savePriceList } from "@/app/dashboard/sales/price-list/actions";

const labelClass = "mb-0.5 block text-xs font-medium";
const inputClass = "h-7 w-full rounded border border-input bg-background px-2 text-xs";

type PriceType = { id: string; code?: string | null; name: string };
type Product = {
  id: string | number;
  code?: string | null;
  name: string;
  pack_unit?: number | null;
  unit?: string | null;
};

type PriceListFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  products?: Product[];
  priceTypes?: PriceType[];
  initialPriceList?: {
    id: string;
    name: string;
    price_type_id: string;
    effective_date: string | null;
    expiry_date: string | null;
    notes: string | null;
    is_active?: boolean;
  } | null;
  initialLines?: Record<string, { price: number; tax_rate: number; vat_type: string }>;
};

function formatPrice(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PriceListFormDialog({
  open,
  onOpenChange,
  onSaved,
  products = [],
  priceTypes = [],
  initialPriceList = null,
  initialLines = {},
}: PriceListFormDialogProps) {
  const seededRows = useMemo(() => {
    return products.map((p) => {
      const key = String(p.id);
      const line = initialLines[key];
      return {
        productId: key,
        code: p.code ?? "",
        name: p.name,
        packUnit: p.pack_unit != null && Number.isFinite(Number(p.pack_unit)) ? String(Number(p.pack_unit)) : "",
        price: line?.price != null ? formatPrice(line.price) : "",
        taxRate: line?.tax_rate != null ? String(line.tax_rate) : "20",
        vatType: line?.vat_type === "exc" ? "exc" : "inc",
      };
    });
  }, [products, initialLines]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [itemSearch, setItemSearch] = useState("");
  const [vatTypesById, setVatTypesById] = useState<Record<string, "inc" | "exc">>({});

  useEffect(() => {
    if (!open) return;
    setHiddenIds(new Set());
    setItemSearch("");
    const nextVatTypes: Record<string, "inc" | "exc"> = {};
    for (const row of seededRows) {
      nextVatTypes[row.productId] = row.vatType === "exc" ? "exc" : "inc";
    }
    setVatTypesById(nextVatTypes);
  }, [open, initialPriceList?.id, seededRows]);

  const searchTerm = itemSearch.trim().toLowerCase();
  const productRows = useMemo(() => {
    const filtered = seededRows.filter((r) => {
      if (hiddenIds.has(r.productId)) return false;
      if (!searchTerm) return true;
      return (
        r.name.toLowerCase().includes(searchTerm) ||
        r.code.toLowerCase().includes(searchTerm)
      );
    });

    return [...filtered].sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [seededRows, hiddenIds, searchTerm]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialPriceList?.id ? "Edit Price List" : "New Price List"}
      contentClassName="max-w-5xl text-sm"
    >
      <form
        action={async (formData) => {
          const result = await savePriceList(formData);
          if (result?.ok) {
            onOpenChange(false);
            onSaved();
          }
        }}
        className="space-y-2"
      >
        {initialPriceList?.id && <input type="hidden" name="id" value={initialPriceList.id} />}

        <div className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Price List Name *</label>
            <input
              name="name"
              required
              className={inputClass}
              defaultValue={initialPriceList?.name ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Price Type</label>
            <select
              name="price_type_id"
              required
              className={inputClass}
              defaultValue={initialPriceList?.price_type_id ?? ""}
            >
              <option value="">-- Select --</option>
              {priceTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {(pt.code ? `${pt.code} - ` : "") + pt.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Effective Date *</label>
            <input
              name="effective_date"
              type="date"
              required
              className={inputClass}
              defaultValue={initialPriceList?.effective_date ?? new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Expiry Date</label>
            <input
              name="expiry_date"
              type="date"
              className={inputClass}
              defaultValue={initialPriceList?.expiry_date ?? ""}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Notes</label>
            <input
              name="notes"
              className={inputClass}
              defaultValue={initialPriceList?.notes ?? ""}
              placeholder="Optional notes"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Item Search</label>
            <input
              className={inputClass}
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Search by product code or name"
            />
          </div>
        </div>

        <div className="max-h-[58vh] overflow-auto rounded border border-border">
          <table className="w-full table-fixed text-xs">
            <thead className="sticky top-0 z-10">
              <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <th className="border-b border-r border-border px-1.5 py-1 text-left" style={{ width: 32 }}>#</th>
                <th className="border-b border-r border-border px-1.5 py-1 text-left" style={{ width: 72 }}>Product Code</th>
                <th className="border-b border-r border-border px-1.5 py-1 text-left">Product Name</th>
                <th className="border-b border-r border-border px-1.5 py-1 text-right" style={{ width: 58 }}>Pack Unit</th>
                <th className="border-b border-r border-border px-1.5 py-1 text-right" style={{ width: 130 }}>Price Tax-Inc</th>
                <th className="border-b border-r border-border px-1.5 py-1 text-right" style={{ width: 120 }}>Tax Rate</th>
                <th className="border-b border-border px-1.5 py-1 text-left" style={{ width: 120 }}>VAT Type</th>
                <th className="border-b border-l border-border px-1 py-1 text-center" style={{ width: 24 }} />
              </tr>
            </thead>
            <tbody>
              {productRows.map((row, idx) => (
                <tr key={row.productId} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="border-b border-r border-border px-1.5 py-1 text-muted-foreground">{idx + 1}</td>
                  <td className="border-b border-r border-border px-1.5 py-1">{row.code || "—"}</td>
                  <td className="border-b border-r border-border px-1.5 py-1">{row.name}</td>
                  <td className="border-b border-r border-border px-1.5 py-1 text-right">{row.packUnit || "—"}</td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <input
                      name={`line_price_${row.productId}`}
                      type="text"
                      defaultValue={row.price}
                      className="h-7 w-full rounded border border-input bg-background px-1.5 text-right text-xs"
                      onBlur={(e) => {
                        const raw = e.currentTarget.value.replace(/,/g, "").trim();
                        if (!raw) return;
                        const n = Number(raw);
                        if (!Number.isFinite(n)) return;
                        e.currentTarget.value = formatPrice(n);
                      }}
                    />
                  </td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <select
                      name={`line_tax_${row.productId}`}
                      className="h-7 w-full rounded border border-input bg-background px-1.5 text-right text-xs"
                      defaultValue={row.taxRate}
                    >
                      <option value="0">No Tax</option>
                      <option value="5">Vat (5%)</option>
                      <option value="10">Vat (10%)</option>
                      <option value="18">Vat (18%)</option>
                      <option value="20">Vat (20%)</option>
                    </select>
                  </td>
                  <td className="border-b border-border px-1 py-0.5">
                    <input
                      type="hidden"
                      name={`line_vat_${row.productId}`}
                      value={vatTypesById[row.productId] ?? row.vatType}
                    />
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        className={`h-7 rounded border text-xs ${
                          (vatTypesById[row.productId] ?? row.vatType) === "inc"
                            ? "border-[var(--navbar)] bg-[var(--navbar)] text-white"
                            : "border-input bg-background text-foreground"
                        }`}
                        onClick={() =>
                          setVatTypesById((prev) => ({ ...prev, [row.productId]: "inc" }))
                        }
                      >
                        Incl
                      </button>
                      <button
                        type="button"
                        className={`h-7 rounded border text-xs ${
                          (vatTypesById[row.productId] ?? row.vatType) === "exc"
                            ? "border-[var(--navbar)] bg-[var(--navbar)] text-white"
                            : "border-input bg-background text-foreground"
                        }`}
                        onClick={() =>
                          setVatTypesById((prev) => ({ ...prev, [row.productId]: "exc" }))
                        }
                      >
                        Excl
                      </button>
                    </div>
                  </td>
                  <td className="border-b border-l border-border px-0.5 py-0.5 text-center">
                    <button
                      type="button"
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                      onClick={() => {
                        setHiddenIds((prev) => {
                          const next = new Set(prev);
                          next.add(row.productId);
                          return next;
                        });
                      }}
                      aria-label="Delete line"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-border bg-background pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" style={{ backgroundColor: "var(--navbar)" }} className="text-white">
            <Save className="h-4 w-4" />
            {initialPriceList?.id ? "Update Price List" : "Save Price List"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
