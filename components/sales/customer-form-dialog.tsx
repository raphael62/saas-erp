"use client";

import { useEffect, useState } from "react";
import { Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { addCustomer, updateCustomer } from "@/app/dashboard/sales/actions";
import { MasterLookupSearchDialog } from "@/components/sales/master-lookup-search-dialog";

const labelClass = "mb-0.5 block text-xs font-medium";
const inputClass = "h-8 w-full rounded border border-input bg-background px-2.5 text-sm";

type LookupItem = { id: string; code?: string; name: string };

type CustomerFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  salesReps: { id: string; name: string }[];
  customerTypes: LookupItem[];
  priceTypes: LookupItem[];
  onLookupChanged?: () => void;
  initialCustomer?: {
    id: string;
    name: string;
    contact_person: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    tax_id?: string | null;
    credit_limit: number;
    payment_terms: number;
    customer_type: string | null;
    price_type: string | null;
    sales_rep_id: string | null;
    is_active?: boolean;
  } | null;
};

export function CustomerFormDialog({
  open,
  onOpenChange,
  onSaved,
  salesReps,
  customerTypes = [],
  priceTypes = [],
  onLookupChanged,
  initialCustomer = null,
}: CustomerFormDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerType, setSelectedCustomerType] = useState("");
  const [selectedPriceType, setSelectedPriceType] = useState("");
  const [showCustomerTypeDropdown, setShowCustomerTypeDropdown] = useState(false);
  const [showPriceTypeDropdown, setShowPriceTypeDropdown] = useState(false);
  const [showCustomerTypeSearch, setShowCustomerTypeSearch] = useState(false);
  const [showPriceTypeSearch, setShowPriceTypeSearch] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelectedCustomerType(initialCustomer?.customer_type ?? "");
    setSelectedPriceType(initialCustomer?.price_type ?? "");
  }, [open, initialCustomer]);

  const filterMatches = (query: string, item: LookupItem) =>
    !query.trim() ||
    (item.name || "").toLowerCase().includes(query.toLowerCase().trim()) ||
    (item.code || "").toLowerCase().includes(query.toLowerCase().trim());

  const filteredCustomerTypes = customerTypes.filter((item) => filterMatches(selectedCustomerType, item));
  const filteredPriceTypes = priceTypes.filter((item) => filterMatches(selectedPriceType, item));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const result = initialCustomer?.id
      ? await updateCustomer(initialCustomer.id, formData)
      : await addCustomer(formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialCustomer ? "Edit Customer" : "New Customer"}
      contentClassName="max-w-4xl text-sm"
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-3"
        onClick={() => {
          setShowCustomerTypeDropdown(false);
          setShowPriceTypeDropdown(false);
        }}
      >
        {error && <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}

        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Customer Code</label>
            <input
              name="tax_id"
              placeholder="e.g. C0001"
              className={inputClass}
              defaultValue={initialCustomer?.tax_id ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Customer Name *</label>
            <input
              name="name"
              required
              placeholder="Enter customer name"
              className={inputClass}
              defaultValue={initialCustomer?.name ?? ""}
            />
          </div>

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Business Name</label>
            <input
              name="contact_person"
              placeholder="Enter business name"
              className={inputClass}
              defaultValue={initialCustomer?.contact_person ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Price Type</label>
            <div className="relative flex gap-1">
              <input
              name="price_type"
                value={selectedPriceType}
                onChange={(e) => {
                  setSelectedPriceType(e.target.value);
                  setShowPriceTypeDropdown(true);
                }}
                onFocus={() => setShowPriceTypeDropdown(true)}
                placeholder="Type or select price type"
                className={inputClass}
                autoComplete="off"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPriceTypeSearch(true);
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-input bg-muted/50 hover:bg-muted"
                aria-label="Search price type"
              >
                <Search className="h-4 w-4" style={{ color: "var(--navbar)" }} />
              </button>
              {showPriceTypeDropdown && filteredPriceTypes.length > 0 && (
                <div
                  className="absolute left-0 right-9 top-full z-50 mt-1 max-h-48 overflow-auto rounded border border-border bg-background shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  {filteredPriceTypes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80"
                      onClick={() => {
                        setSelectedPriceType(item.name);
                        setShowPriceTypeDropdown(false);
                      }}
                    >
                      <span className="text-muted-foreground">{item.code ?? "—"}</span>
                      {" — "}
                      <span className="font-medium">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Mobile</label>
            <input
              name="phone"
              placeholder="e.g. +256..."
              className={inputClass}
              defaultValue={initialCustomer?.phone ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Email</label>
            <input
              name="email"
              type="email"
              placeholder="e.g. name@domain.com"
              className={inputClass}
              defaultValue={initialCustomer?.email ?? ""}
            />
          </div>

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Business Address</label>
            <input
              name="address"
              placeholder="Enter business address"
              className={inputClass}
              defaultValue={initialCustomer?.address ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Customer Type</label>
            <div className="relative flex gap-1">
              <input
              name="customer_type"
                className={inputClass}
                value={selectedCustomerType}
                onChange={(e) => {
                  setSelectedCustomerType(e.target.value);
                  setShowCustomerTypeDropdown(true);
                }}
                onFocus={() => setShowCustomerTypeDropdown(true)}
                placeholder="Type or select customer type"
                autoComplete="off"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCustomerTypeSearch(true);
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-input bg-muted/50 hover:bg-muted"
                aria-label="Search customer type"
              >
                <Search className="h-4 w-4" style={{ color: "var(--navbar)" }} />
              </button>
              {showCustomerTypeDropdown && filteredCustomerTypes.length > 0 && (
                <div
                  className="absolute left-0 right-9 top-full z-50 mt-1 max-h-48 overflow-auto rounded border border-border bg-background shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  {filteredCustomerTypes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80"
                      onClick={() => {
                        setSelectedCustomerType(item.name);
                        setShowCustomerTypeDropdown(false);
                      }}
                    >
                      <span className="text-muted-foreground">{item.code ?? "—"}</span>
                      {" — "}
                      <span className="font-medium">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Business Executive</label>
            <select name="sales_rep_id" className={inputClass} defaultValue={initialCustomer?.sales_rep_id ?? ""}>
              <option value="">Select executive</option>
              {salesReps.map((rep) => (
                <option key={rep.id} value={rep.id}>{rep.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Credit Limit</label>
            <input
              name="credit_limit"
              type="number"
              step="0.01"
              min="0"
              className={inputClass}
              defaultValue={String(initialCustomer?.credit_limit ?? 0)}
            />
          </div>

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Call Days</label>
            <input
              name="payment_terms"
              type="number"
              min="0"
              className={inputClass}
              defaultValue={String(initialCustomer?.payment_terms ?? 30)}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Status</label>
            <select
              name="is_active"
              defaultValue={initialCustomer?.is_active === false ? "false" : "true"}
              className={inputClass}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} style={{ backgroundColor: "var(--navbar)" }} className="text-white hover:opacity-90">
            <Save className="h-4 w-4" />
            {pending ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>

      <MasterLookupSearchDialog
        open={showPriceTypeSearch}
        onOpenChange={setShowPriceTypeSearch}
        title="Price Type Search"
        codeLabel="Price Type Code"
        nameLabel="Price Type Name"
        table="price_types"
        items={priceTypes}
        onSelect={(item) => setSelectedPriceType(item.name)}
        onItemAdded={onLookupChanged}
      />
      <MasterLookupSearchDialog
        open={showCustomerTypeSearch}
        onOpenChange={setShowCustomerTypeSearch}
        title="Customer Type Search"
        codeLabel="Customer Type Code"
        nameLabel="Customer Type Name"
        table="customer_types"
        items={customerTypes}
        onSelect={(item) => setSelectedCustomerType(item.name)}
        onItemAdded={onLookupChanged}
      />
    </Dialog>
  );
}
