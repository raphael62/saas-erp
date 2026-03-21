"use client";

import { useEffect, useRef, useState } from "react";
import { Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { addSalesRep, updateSalesRep } from "@/app/dashboard/sales/sales-reps/actions";

const labelClass = "mb-0.5 block text-xs font-medium";
const inputClass = "h-8 w-full rounded border border-input bg-background px-2.5 text-sm";

type SalesRepFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  initialSalesRep?: {
    id: string;
    code: string | null;
    first_name?: string | null;
    last_name?: string | null;
    sales_rep_type?: string | null;
    phone?: string | null;
    email?: string | null;
    location?: string | null;
    is_active?: boolean;
  } | null;
};

type RepTypeItem = { id: string; code: string; name: string };

const REP_TYPES: RepTypeItem[] = [
  { id: "sales-team", code: "SLS", name: "Sales Team" },
  { id: "field-agent", code: "FLD", name: "Field Agent" },
  { id: "key-account", code: "KEY", name: "Key Account" },
  { id: "distributor-rep", code: "DST", name: "Distributor Rep" },
];
const LOCATIONS = ["Head Office", "Kampala", "Mbarara", "Gulu"];

export function SalesRepFormDialog({ open, onOpenChange, onSaved, initialSalesRep = null }: SalesRepFormDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repTypes, setRepTypes] = useState<RepTypeItem[]>(REP_TYPES);
  const [selectedRepType, setSelectedRepType] = useState("");
  const [showRepTypeDropdown, setShowRepTypeDropdown] = useState(false);
  const [showRepTypeSearch, setShowRepTypeSearch] = useState(false);
  const [repTypeSearch, setRepTypeSearch] = useState("");
  const [showRepTypeNewForm, setShowRepTypeNewForm] = useState(false);
  const [showRepTypeEditForm, setShowRepTypeEditForm] = useState(false);
  const [newRepTypeCode, setNewRepTypeCode] = useState("");
  const [newRepTypeName, setNewRepTypeName] = useState("");
  const [editRepTypeCode, setEditRepTypeCode] = useState("");
  const [editRepTypeName, setEditRepTypeName] = useState("");
  const [selectedSearchTypeId, setSelectedSearchTypeId] = useState<string | null>(null);
  const repTypeRef = useRef<HTMLDivElement>(null);

  const filteredRepTypes = repTypes.filter((v) =>
    v.name.toLowerCase().includes(selectedRepType.toLowerCase().trim()) ||
    v.code.toLowerCase().includes(selectedRepType.toLowerCase().trim())
  );
  const dialogRepTypes = repTypes.filter((v) =>
    v.name.toLowerCase().includes(repTypeSearch.toLowerCase().trim()) ||
    v.code.toLowerCase().includes(repTypeSearch.toLowerCase().trim())
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (repTypeRef.current && !repTypeRef.current.contains(target)) setShowRepTypeDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const initialType = initialSalesRep?.sales_rep_type ?? REP_TYPES[0]?.name ?? "";
    if (
      initialType &&
      !repTypes.some((v) => v.name.toLowerCase() === initialType.toLowerCase())
    ) {
      const generatedId = `${initialType.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
      setRepTypes((prev) => [...prev, { id: generatedId, code: "", name: initialType }]);
    }
    setSelectedRepType(initialType);
  }, [open, initialSalesRep, repTypes]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const result = initialSalesRep?.id
      ? await updateSalesRep(initialSalesRep.id, formData)
      : await addSalesRep(formData);
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
      title={initialSalesRep ? "Edit Business Executive" : "New Business Executive"}
      contentClassName="max-w-3xl text-sm"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}

        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Executive Code *</label>
            <input
              name="code"
              required
              placeholder="e.g. EX001"
              className={inputClass}
              defaultValue={initialSalesRep?.code ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Status</label>
            <select
              name="is_active"
              defaultValue={initialSalesRep?.is_active === false ? "false" : "true"}
              className={inputClass}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>First Name *</label>
            <input
              name="first_name"
              required
              placeholder="First Name"
              className={inputClass}
              defaultValue={initialSalesRep?.first_name ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Last Name *</label>
            <input
              name="last_name"
              required
              placeholder="Last Name"
              className={inputClass}
              defaultValue={initialSalesRep?.last_name ?? ""}
            />
          </div>

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Sales Rep Type</label>
            <div className="relative flex gap-1" ref={repTypeRef}>
              <input
                name="sales_rep_type"
                value={selectedRepType}
                onChange={(e) => {
                  setSelectedRepType(e.target.value);
                  setShowRepTypeDropdown(true);
                }}
                onFocus={() => setShowRepTypeDropdown(true)}
                placeholder="Type or select rep type"
                className={inputClass}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowRepTypeSearch(true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-input bg-muted/50 hover:bg-muted"
                aria-label="Search sales rep type"
              >
                <Search className="h-4 w-4" style={{ color: "var(--navbar)" }} />
              </button>
              {showRepTypeDropdown && filteredRepTypes.length > 0 && (
                <div className="absolute left-0 right-9 top-full z-50 mt-1 max-h-40 overflow-auto rounded border border-border bg-background shadow-lg">
                  {filteredRepTypes.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      className="w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80"
                      onClick={() => {
                        setSelectedRepType(type.name);
                        setShowRepTypeDropdown(false);
                      }}
                    >
                      <span className="text-muted-foreground">{type.code || "—"}</span>
                      {" — "}
                      <span className="font-medium">{type.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Phone</label>
            <input
              name="phone"
              placeholder="e.g. +256 700 000000"
              className={inputClass}
              defaultValue={initialSalesRep?.phone ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Email</label>
            <input
              name="email"
              type="email"
              placeholder="name@company.com"
              className={inputClass}
              defaultValue={initialSalesRep?.email ?? ""}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} style={{ color: "var(--navbar)" }}>Location</label>
            <select name="location" className={inputClass} defaultValue={initialSalesRep?.location ?? LOCATIONS[0]}>
              {LOCATIONS.map((location) => (
                <option key={location} value={location}>{location}</option>
              ))}
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

      <Dialog open={showRepTypeSearch} onOpenChange={setShowRepTypeSearch} title="Sales Rep Type Search" showGearIcon={false} contentClassName="max-w-lg text-sm">
        <div className="space-y-3">
          {showRepTypeNewForm ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const code = newRepTypeCode.trim();
                const name = newRepTypeName.trim();
                if (!name) return;
                const exists = repTypes.some((t) => t.name.toLowerCase() === name.toLowerCase());
                if (!exists) {
                  const id = `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
                  setRepTypes((prev) => [...prev, { id, code, name }]);
                }
                setSelectedRepType(name);
                setNewRepTypeCode("");
                setNewRepTypeName("");
                setShowRepTypeNewForm(false);
              }}
            >
              <div>
                <label className={labelClass} style={{ color: "var(--navbar)" }}>Code *</label>
                <input
                  value={newRepTypeCode}
                  onChange={(e) => setNewRepTypeCode(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass} style={{ color: "var(--navbar)" }}>Name *</label>
                <input
                  value={newRepTypeName}
                  onChange={(e) => setNewRepTypeName(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowRepTypeNewForm(false)}>Cancel</Button>
                <Button type="submit" size="sm" className="text-white" style={{ backgroundColor: "var(--navbar)" }}>Save</Button>
              </div>
            </form>
          ) : showRepTypeEditForm ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!selectedSearchTypeId) return;
                const code = editRepTypeCode.trim();
                const name = editRepTypeName.trim();
                if (!name) return;
                const previous = repTypes.find((t) => t.id === selectedSearchTypeId);
                setRepTypes((prev) =>
                  prev.map((t) =>
                    t.id === selectedSearchTypeId ? { ...t, code, name } : t
                  )
                );
                if (selectedRepType === previous?.name) setSelectedRepType(name);
                setShowRepTypeEditForm(false);
                setSelectedSearchTypeId(selectedSearchTypeId);
              }}
            >
              <div>
                <label className={labelClass} style={{ color: "var(--navbar)" }}>Code *</label>
                <input
                  value={editRepTypeCode}
                  onChange={(e) => setEditRepTypeCode(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass} style={{ color: "var(--navbar)" }}>Name *</label>
                <input
                  value={editRepTypeName}
                  onChange={(e) => setEditRepTypeName(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowRepTypeEditForm(false)}>Cancel</Button>
                <Button type="submit" size="sm" className="text-white" style={{ backgroundColor: "var(--navbar)" }}>Save</Button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={repTypeSearch}
                  onChange={(e) => setRepTypeSearch(e.target.value)}
                  placeholder="Search (F3)"
                  className={inputClass}
                />
                <Button size="sm" className="text-white" style={{ backgroundColor: "var(--navbar)" }}>
                  Search (F3)
                </Button>
              </div>
              <div className="max-h-64 overflow-auto rounded border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                      <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>
                        Sales Rep Type Code
                      </th>
                      <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>
                        Sales Rep Type Name
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dialogRepTypes.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-2 py-4 text-center text-muted-foreground">
                          No sales rep types. Click New to add one.
                        </td>
                      </tr>
                    ) : (
                      dialogRepTypes.map((type) => (
                        <tr
                          key={type.id}
                          className={`cursor-pointer border-b border-border last:border-0 hover:bg-muted/50 ${
                            selectedSearchTypeId === type.id ? "bg-muted/50" : ""
                          }`}
                          onClick={() => setSelectedSearchTypeId(type.id)}
                          onDoubleClick={() => {
                            setSelectedRepType(type.name);
                            setShowRepTypeSearch(false);
                          }}
                        >
                          <td className="px-2 py-2">{type.code || "—"}</td>
                          <td className="px-2 py-2 font-medium">{type.name}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowRepTypeNewForm(true)}>
                  New
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedSearchTypeId}
                  onClick={() => {
                    if (!selectedSearchTypeId) return;
                    const selected = dialogRepTypes.find((t) => t.id === selectedSearchTypeId);
                    if (!selected) return;
                    setEditRepTypeCode(selected.code);
                    setEditRepTypeName(selected.name);
                    setShowRepTypeEditForm(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedSearchTypeId}
                  onClick={() => {
                    if (!selectedSearchTypeId) return;
                    const selected = dialogRepTypes.find((t) => t.id === selectedSearchTypeId);
                    if (!selected) return;
                    setSelectedRepType(selected.name);
                    setShowRepTypeSearch(false);
                  }}
                >
                  Select
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowRepTypeSearch(false)}>
                  Close
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </Dialog>
  );
}

