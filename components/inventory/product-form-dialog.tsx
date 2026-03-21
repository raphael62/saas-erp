"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CategorySearchDialog } from "@/components/inventory/category-search-dialog";
import { UnitSearchDialog } from "@/components/inventory/unit-search-dialog";
import { EmptiesTypeSearchDialog } from "@/components/inventory/empties-type-search-dialog";
import { addProduct, updateProduct } from "@/app/dashboard/inventory/actions";

const labelClass = "mb-0.5 block text-xs font-medium";
const inputClass = "h-8 w-full rounded border border-input bg-background px-2.5 text-sm";

type LookupItem = { id: string; code?: string; name: string };
type EditableProduct = {
  id: string;
  code?: string | null;
  name: string;
  category?: string | null;
  unit?: string | null;
  empties_type?: string | null;
  pack_unit?: number | null;
  plastic_cost?: number | null;
  bottle_cost?: number | null;
  min_stock?: number | null;
  reorder_qty?: number | null;
  barcode?: string | null;
  supplier_id?: string | null;
  description?: string | null;
  sku?: string | null;
  taxable?: boolean;
  returnable?: boolean;
  is_active?: boolean;
};

type ProductFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: LookupItem[];
  units: LookupItem[];
  suppliers: { id: string; name: string }[];
  emptiesTypes: LookupItem[];
  initialProduct?: EditableProduct | null;
};

export function ProductFormDialog({
  open,
  onOpenChange,
  categories,
  units,
  suppliers,
  emptiesTypes,
  initialProduct = null,
}: ProductFormDialogProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [selectedEmptiesType, setSelectedEmptiesType] = useState("");
  const [showCategorySearch, setShowCategorySearch] = useState(false);
  const [showUnitSearch, setShowUnitSearch] = useState(false);
  const [showEmptiesTypeSearch, setShowEmptiesTypeSearch] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);
  const [showEmptiesDropdown, setShowEmptiesDropdown] = useState(false);
  const [returnableChecked, setReturnableChecked] = useState(false);
  const [taxableChecked, setTaxableChecked] = useState(true);
  const categoryRef = useRef<HTMLDivElement>(null);
  const unitRef = useRef<HTMLDivElement>(null);
  const emptiesRef = useRef<HTMLDivElement>(null);

  const isEditing = Boolean(initialProduct?.id);

  const filterMatches = (query: string, item: LookupItem) =>
    !query.trim() ||
    (item.name || "").toLowerCase().includes(query.toLowerCase().trim()) ||
    (item.code || "").toLowerCase().includes(query.toLowerCase().trim());

  const filteredCategories = categories.filter((c) => filterMatches(selectedCategory, c));
  const filteredUnits = units.filter((u) => filterMatches(selectedUnit, u));
  const filteredEmpties = emptiesTypes.filter((e) => filterMatches(selectedEmptiesType, e));

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelectedCategory(initialProduct?.category ?? "");
    setSelectedUnit(initialProduct?.unit ?? "");
    setSelectedEmptiesType(initialProduct?.empties_type ?? "");
    setReturnableChecked(Boolean(initialProduct?.returnable));
    setTaxableChecked(initialProduct?.taxable !== false);
  }, [open, initialProduct]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (categoryRef.current && !categoryRef.current.contains(target)) setShowCategoryDropdown(false);
      if (unitRef.current && !unitRef.current.contains(target)) setShowUnitDropdown(false);
      if (emptiesRef.current && !emptiesRef.current.contains(target)) setShowEmptiesDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const result = isEditing && initialProduct?.id
      ? await updateProduct(initialProduct.id, formData)
      : await addProduct(formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    (e.target as HTMLFormElement).reset();
    setSelectedCategory("");
    setSelectedUnit("");
    setSelectedEmptiesType("");
    setReturnableChecked(false);
    setTaxableChecked(true);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Edit Product" : "New Product"}
      contentClassName="max-w-4xl text-sm"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>
        )}
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {/* Left column */}
          <div className="space-y-3">
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Product Code *</label>
              <input name="code" required placeholder="e.g. P001" className={inputClass} defaultValue={initialProduct?.code ?? ""} />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>BrandCategory *</label>
              <div className="relative flex gap-1" ref={categoryRef}>
                <input
                  name="category"
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setShowCategoryDropdown(true);
                  }}
                  onFocus={() => setShowCategoryDropdown(true)}
                  required
                  placeholder="Type or select category"
                  className={inputClass}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowCategorySearch(true)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-input bg-muted/50 hover:bg-muted"
                  aria-label="Search category"
                >
                  <Search className="h-4 w-4" style={{ color: "var(--navbar)" }} />
                </button>
                {showCategoryDropdown && filteredCategories.length > 0 && (
                  <div className="absolute left-0 right-9 top-full z-50 mt-1 max-h-48 overflow-auto rounded border border-border bg-background shadow-lg">
                    {filteredCategories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80"
                        onClick={() => {
                          setSelectedCategory(c.name);
                          setShowCategoryDropdown(false);
                          (categoryRef.current?.querySelector("input") as HTMLInputElement)?.blur();
                        }}
                      >
                        <span className="text-muted-foreground">{c.code ?? "—"}</span>
                        {" — "}
                        <span className="font-medium">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Pack Unit *</label>
              <input name="pack_unit" type="number" min="0" required placeholder="e.g. 24" className={inputClass} defaultValue={initialProduct?.pack_unit ?? ""} />
            </div>
            {returnableChecked && (
              <div>
                <label className={labelClass} style={{ color: "var(--navbar)" }}>Plastic Cost</label>
                <input name="plastic_cost" type="number" step="0.01" min="0" defaultValue={initialProduct?.plastic_cost ?? 0} className={inputClass} />
              </div>
            )}
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Reorder Level</label>
              <input name="min_stock" placeholder="Min stock level" className={inputClass} defaultValue={initialProduct?.min_stock ?? ""} />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Barcode</label>
              <input name="barcode" placeholder="Scan or enter barcode" className={inputClass} defaultValue={initialProduct?.barcode ?? ""} />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Vendor / Supplier</label>
              <select name="supplier_id" className={inputClass} defaultValue={initialProduct?.supplier_id ?? ""}>
                <option value="">Select Vendor</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Description</label>
              <textarea name="description" rows={2} placeholder="Product description" defaultValue={initialProduct?.description ?? ""} className={`min-h-[3.5rem] w-full rounded border border-input bg-background px-2.5 py-1.5 text-sm resize-none`} />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-3">
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Product Name *</label>
              <input name="name" required placeholder="Enter product name" className={inputClass} defaultValue={initialProduct?.name ?? ""} />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Unit of Measure *</label>
              <div className="relative flex gap-1" ref={unitRef}>
                <input
                  name="unit"
                  value={selectedUnit}
                  onChange={(e) => {
                    setSelectedUnit(e.target.value);
                    setShowUnitDropdown(true);
                  }}
                  onFocus={() => setShowUnitDropdown(true)}
                  required
                  placeholder="Type or select unit"
                  className={inputClass}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowUnitSearch(true)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-input bg-muted/50 hover:bg-muted"
                  aria-label="Search unit"
                >
                  <Search className="h-4 w-4" style={{ color: "var(--navbar)" }} />
                </button>
                {showUnitDropdown && filteredUnits.length > 0 && (
                  <div className="absolute left-0 right-9 top-full z-50 mt-1 max-h-48 overflow-auto rounded border border-border bg-background shadow-lg">
                    {filteredUnits.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80"
                        onClick={() => {
                          setSelectedUnit(u.name);
                          setShowUnitDropdown(false);
                          (unitRef.current?.querySelector("input") as HTMLInputElement)?.blur();
                        }}
                      >
                        <span className="text-muted-foreground">{u.code ?? "—"}</span>
                        {" — "}
                        <span className="font-medium">{u.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Empties Type</label>
              <div className="relative flex gap-1" ref={emptiesRef}>
                <input
                  name="empties_type"
                  value={selectedEmptiesType}
                  onChange={(e) => {
                    setSelectedEmptiesType(e.target.value);
                    setShowEmptiesDropdown(true);
                  }}
                  onFocus={() => setShowEmptiesDropdown(true)}
                  placeholder="Type or select (optional)"
                  className={inputClass}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowEmptiesTypeSearch(true)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-input bg-muted/50 hover:bg-muted"
                  aria-label="Search empties type"
                >
                  <Search className="h-4 w-4" style={{ color: "var(--navbar)" }} />
                </button>
                {showEmptiesDropdown && (
                  <div className="absolute left-0 right-9 top-full z-50 mt-1 max-h-48 overflow-auto rounded border border-border bg-background shadow-lg">
                    <button
                      type="button"
                      className="w-full px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-muted/80"
                      onClick={() => {
                        setSelectedEmptiesType("");
                        setShowEmptiesDropdown(false);
                        (emptiesRef.current?.querySelector("input") as HTMLInputElement)?.blur();
                      }}
                    >
                      None
                    </button>
                    {filteredEmpties.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className="w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80"
                        onClick={() => {
                          setSelectedEmptiesType(e.name);
                          setShowEmptiesDropdown(false);
                          (emptiesRef.current?.querySelector("input") as HTMLInputElement)?.blur();
                        }}
                      >
                        <span className="text-muted-foreground">{e.code ?? "—"}</span>
                        {" — "}
                        <span className="font-medium">{e.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {returnableChecked && (
              <div>
                <label className={labelClass} style={{ color: "var(--navbar)" }}>Bottle Cost</label>
                <input name="bottle_cost" type="number" step="0.01" min="0" defaultValue={initialProduct?.bottle_cost ?? 0} className={inputClass} />
              </div>
            )}
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Reorder Quantity</label>
              <input name="reorder_qty" type="number" min="0" placeholder="Qty to reorder" className={inputClass} defaultValue={initialProduct?.reorder_qty ?? ""} />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>SKU</label>
              <input name="sku" placeholder="Stock Keeping Unit" className={inputClass} defaultValue={initialProduct?.sku ?? ""} />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Status</label>
              <select name="is_active" className={inputClass} defaultValue={initialProduct?.is_active === false ? "false" : "true"}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-4 pt-1">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              name="taxable"
              value="1"
              className="h-3.5 w-3.5 rounded"
              checked={taxableChecked}
              onChange={(e) => setTaxableChecked(e.target.checked)}
            />
            <span className="text-xs" style={{ color: "var(--navbar)" }}>Taxable</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              name="returnable"
              value="1"
              className="h-3.5 w-3.5 rounded"
              checked={returnableChecked}
              onChange={(e) => setReturnableChecked(e.target.checked)}
            />
            <span className="text-xs" style={{ color: "var(--navbar)" }}>Returnable</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} style={{ backgroundColor: "var(--navbar)" }} className="text-white hover:opacity-90">
            <Save className="h-4 w-4" />
            {pending ? "Saving…" : isEditing ? "Update" : "Save"}
          </Button>
        </div>
      </form>

      <CategorySearchDialog
        open={showCategorySearch}
        onOpenChange={setShowCategorySearch}
        categories={categories}
        onSelect={(c) => setSelectedCategory(c.name)}
        onCategoryAdded={() => router.refresh()}
      />
      <UnitSearchDialog
        open={showUnitSearch}
        onOpenChange={setShowUnitSearch}
        units={units}
        onSelect={(u) => setSelectedUnit(u.name)}
        onUnitAdded={() => router.refresh()}
      />
      <EmptiesTypeSearchDialog
        open={showEmptiesTypeSearch}
        onOpenChange={setShowEmptiesTypeSearch}
        emptiesTypes={emptiesTypes}
        onSelect={(e) => setSelectedEmptiesType(e.name)}
        onItemAdded={() => router.refresh()}
      />
    </Dialog>
  );
}
