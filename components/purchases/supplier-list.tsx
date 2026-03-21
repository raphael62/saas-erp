"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { deleteSupplier, saveSupplier, toggleSupplierActive } from "@/app/dashboard/purchases/suppliers/actions";

type Supplier = {
  id: string;
  code?: string | null;
  name: string;
  category?: string | null;
  tax_id?: string | null;
  contact_person: string | null;
  phone: string | null;
  mobile?: string | null;
  email: string | null;
  address?: string | null;
  city?: string | null;
  payment_terms?: number | null;
  bank_name?: string | null;
  bank_account?: string | null;
  bank_branch?: string | null;
  credit_limit?: number | null;
  currency?: string | null;
  supplier_status?: string | null;
  notes?: string | null;
  is_active?: boolean | null;
};

export function SupplierList({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<"code" | "name" | "payment_terms" | "credit_limit">("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const editing = suppliers.find((s) => s.id === editingId) ?? null;
  const selected = suppliers.find((s) => s.id === selectedId) ?? null;

  const categories = useMemo(
    () => Array.from(new Set(suppliers.map((s) => (s.category ?? "").trim()).filter(Boolean))).sort(),
    [suppliers]
  );
  const suggestedCode = useMemo(() => {
    const maxCode = suppliers.reduce((max, s) => {
      const n = Number(String(s.code ?? "").trim());
      if (!Number.isFinite(n)) return max;
      return Math.max(max, n);
    }, 999);
    return String(maxCode + 1).padStart(4, "0");
  }, [suppliers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = suppliers.filter((s) => {
      if (!includeInactive && !s.is_active) return false;
      if (!q) return true;
      return (
        String(s.code ?? "").toLowerCase().includes(q) ||
        String(s.name ?? "").toLowerCase().includes(q) ||
        String(s.phone ?? "").toLowerCase().includes(q) ||
        String(s.contact_person ?? "").toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      const av =
        sortCol === "code"
          ? String(a.code ?? "")
          : sortCol === "name"
            ? a.name
            : sortCol === "payment_terms"
              ? Number(a.payment_terms ?? 0)
              : Number(a.credit_limit ?? 0);
      const bv =
        sortCol === "code"
          ? String(b.code ?? "")
          : sortCol === "name"
            ? b.name
            : sortCol === "payment_terms"
              ? Number(b.payment_terms ?? 0)
              : Number(b.credit_limit ?? 0);

      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [suppliers, includeInactive, search, sortCol, sortDir]);

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function toggleSort(col: "code" | "name" | "payment_terms" | "credit_limit") {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this supplier?")) return;
    setPending(true);
    const result = await deleteSupplier(id);
    setPending(false);
    if (result?.error) setMessage(result.error);
    else {
      setMessage("Vendor deleted.");
      setSelectedId(null);
      router.refresh();
    }
  }

  async function handleToggleActive(nextActive: boolean) {
    if (!selected) return;
    setPending(true);
    const result = await toggleSupplierActive(selected.id, nextActive);
    setPending(false);
    if (result?.error) setMessage(result.error);
    else {
      setMessage(nextActive ? "Vendor activated." : "Vendor deactivated.");
      router.refresh();
    }
  }

  function formatTerms(days: number | null | undefined) {
    const d = Number(days ?? 0);
    return `net${d}`;
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">Vendor Management</h1>
        <p className="text-sm text-muted-foreground">Suppliers & purchase partners</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => {
              setIncludeInactive(e.target.checked);
              setPage(1);
            }}
            className="rounded"
          />
          Include deactivated
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Input text (name/code/phone)"
          className="h-7 w-64 rounded border border-input bg-background px-2 text-xs"
        />
        <span className="text-muted-foreground">({filtered.length} records)</span>
      </div>

      {message && (
        <p className="rounded border border-border bg-muted/30 px-3 py-1.5 text-xs">{message}</p>
      )}

      <div className="max-h-[calc(100vh-19rem)] overflow-auto rounded border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="border-b border-r border-border px-2 py-1.5 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>#</th>
              <th className="border-b border-r border-border px-2 py-1.5 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("code")}>
                  Vendor Code {sortCol === "code" ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 opacity-40" />}
                </button>
              </th>
              <th className="border-b border-r border-border px-2 py-1.5 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("name")}>
                  Vendor Name {sortCol === "name" ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 opacity-40" />}
                </button>
              </th>
              <th className="border-b border-r border-border px-2 py-1.5 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>Contact Person</th>
              <th className="border-b border-r border-border px-2 py-1.5 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>Phone</th>
              <th className="border-b border-r border-border px-2 py-1.5 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("payment_terms")}>
                  Payment Terms {sortCol === "payment_terms" ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 opacity-40" />}
                </button>
              </th>
              <th className="border-b border-r border-border px-2 py-1.5 text-right font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <button type="button" className="ml-auto flex items-center gap-1" onClick={() => toggleSort("credit_limit")}>
                  Credit Limit {sortCol === "credit_limit" ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 opacity-40" />}
                </button>
              </th>
              <th className="border-b border-r border-border px-2 py-1.5 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>Category</th>
              <th className="border-b border-border px-2 py-1.5 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-5 text-center text-muted-foreground">
                  No vendors found.
                </td>
              </tr>
            ) : (
              paginated.map((s, idx) => (
                <tr
                  key={s.id}
                  className={`cursor-pointer border-b border-border last:border-0 ${selectedId === s.id ? "bg-muted/60" : idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <td className="border-r border-border px-2 py-1.5 text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + idx + 1}
                  </td>
                  <td className="border-r border-border px-2 py-1.5">
                    <button
                      type="button"
                      className="text-left text-[var(--navbar)] hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(s.id);
                        setShowForm(true);
                      }}
                    >
                      {s.code ?? "-"}
                    </button>
                  </td>
                  <td className="border-r border-border px-2 py-1.5">
                    <button
                      type="button"
                      className="text-left text-[var(--navbar)] hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(s.id);
                        setShowForm(true);
                      }}
                    >
                      {s.name}
                    </button>
                  </td>
                  <td className="border-r border-border px-2 py-1.5">{s.contact_person ?? "-"}</td>
                  <td className="border-r border-border px-2 py-1.5">{s.phone ?? s.mobile ?? "-"}</td>
                  <td className="border-r border-border px-2 py-1.5">{formatTerms(s.payment_terms)}</td>
                  <td className="border-r border-border px-2 py-1.5 text-right">
                    {Number(s.credit_limit ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="border-r border-border px-2 py-1.5">{s.category ?? "-"}</td>
                  <td className="px-2 py-1.5">{s.is_active ? "Active" : "Inactive"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {(page - 1) * PAGE_SIZE + (paginated.length ? 1 : 0)}-
          {(page - 1) * PAGE_SIZE + paginated.length} of {filtered.length}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <span>
            Page {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-3 py-2">
        <Button
          size="sm"
          style={{ backgroundColor: "var(--navbar)" }}
          className="text-white"
          onClick={() => {
            setEditingId(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New (F2)
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            setEditingId(selected.id);
            setShowForm(true);
          }}
        >
          Edit
        </Button>
        <Button size="sm" variant="outline" disabled={!selected || pending} onClick={() => selected && handleDelete(selected.id)}>
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!selected || pending}
          onClick={() => {
            if (!selected) return;
            handleToggleActive(!(selected.is_active ?? true));
          }}
        >
          {(selected?.is_active ?? true) ? "Deactivate" : "Activate"}
        </Button>
        <Button size="sm" variant="outline" disabled>
          <FileSpreadsheet className="h-4 w-4" />
          Excel
        </Button>
      </div>

      <SupplierFormDialog
        open={showForm}
        onOpenChange={(next) => {
          setShowForm(next);
          if (!next) setEditingId(null);
        }}
        supplier={editing}
        suggestedCode={suggestedCode}
        categories={categories}
        onSaved={() => {
          setMessage("Vendor saved.");
          router.refresh();
        }}
      />
    </div>
  );
}

function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
  suggestedCode,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  supplier: Supplier | null;
  suggestedCode: string;
  categories: string[];
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaults = useMemo(
    () => ({
      id: supplier?.id ?? "",
      code: supplier?.code ?? suggestedCode,
      name: supplier?.name ?? "",
      category: supplier?.category ?? "",
      tax_id: supplier?.tax_id ?? "",
      contact_person: supplier?.contact_person ?? "",
      phone: supplier?.phone ?? "",
      mobile: supplier?.mobile ?? "",
      email: supplier?.email ?? "",
      address: supplier?.address ?? "",
      city: supplier?.city ?? "",
      payment_terms: `net${Number(supplier?.payment_terms ?? 30)}`,
      bank_name: supplier?.bank_name ?? "",
      bank_account: supplier?.bank_account ?? "",
      bank_branch: supplier?.bank_branch ?? "",
      credit_limit: Number(supplier?.credit_limit ?? 0).toFixed(2),
      currency: supplier?.currency ?? "GHS",
      supplier_status: supplier?.supplier_status ?? "Active",
      notes: supplier?.notes ?? "",
      is_active: String(supplier?.is_active ?? true),
    }),
    [supplier, suggestedCode]
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await saveSupplier(new FormData(e.currentTarget));
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={supplier ? "Edit Vendor" : "New Vendor"}
      showGearIcon={false}
      contentClassName="max-w-[720px]"
      bodyClassName="max-h-[82vh] overflow-y-auto p-4"
    >
      <form onSubmit={onSubmit} className="space-y-2 text-xs">
        <input type="hidden" name="id" defaultValue={defaults.id} />

        <div className="grid grid-cols-2 gap-2">
          <Field label="Vendor Code *">
            <input name="code" defaultValue={defaults.code} required className="h-7 w-full rounded border border-input bg-background px-2" />
          </Field>
          <Field label="Vendor Name *">
            <input name="name" defaultValue={defaults.name} required className="h-7 w-full rounded border border-input bg-background px-2" />
          </Field>

          <Field label="Category">
            <input name="category" list="supplier-category-list" defaultValue={defaults.category} className="h-7 w-full rounded border border-input bg-background px-2" placeholder="Select Category" />
            <datalist id="supplier-category-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Tax ID / VAT Number">
            <input name="tax_id" defaultValue={defaults.tax_id} className="h-7 w-full rounded border border-input bg-background px-2" />
          </Field>

          <Field label="Contact Person">
            <input name="contact_person" defaultValue={defaults.contact_person} className="h-7 w-full rounded border border-input bg-background px-2" />
          </Field>
          <Field label="Phone">
            <input name="phone" defaultValue={defaults.phone} className="h-7 w-full rounded border border-input bg-background px-2" />
          </Field>

          <Field label="Mobile">
            <input name="mobile" defaultValue={defaults.mobile} className="h-7 w-full rounded border border-input bg-background px-2" />
          </Field>
          <Field label="Email">
            <input name="email" type="email" defaultValue={defaults.email} className="h-7 w-full rounded border border-input bg-background px-2" />
          </Field>

          <Field label="Address" colSpan2>
            <input name="address" defaultValue={defaults.address} className="h-7 w-full rounded border border-input bg-background px-2" />
          </Field>

          <Field label="City">
            <input name="city" defaultValue={defaults.city} className="h-7 w-full rounded border border-input bg-background px-2" />
          </Field>
          <Field label="Payment Terms">
            <select name="payment_terms" defaultValue={defaults.payment_terms} className="h-7 w-full rounded border border-input bg-background px-2">
              <option value="net0">net0</option>
              <option value="net7">net7</option>
              <option value="net14">net14</option>
              <option value="net30">net30</option>
              <option value="net60">net60</option>
              <option value="net90">net90</option>
            </select>
          </Field>

          <Field label="Bank Name">
            <input name="bank_name" defaultValue={defaults.bank_name} className="h-7 w-full rounded border border-input bg-background px-2" />
          </Field>
          <Field label="Bank Account">
            <input name="bank_account" defaultValue={defaults.bank_account} className="h-7 w-full rounded border border-input bg-background px-2" />
          </Field>

          <Field label="Bank Branch">
            <input name="bank_branch" defaultValue={defaults.bank_branch} className="h-7 w-full rounded border border-input bg-background px-2" />
          </Field>
          <Field label="Credit Limit">
            <input name="credit_limit" defaultValue={defaults.credit_limit} className="h-7 w-full rounded border border-input bg-background px-2" />
          </Field>

          <Field label="Currency">
            <select name="currency" defaultValue={defaults.currency} className="h-7 w-full rounded border border-input bg-background px-2">
              <option value="GHS">GHS</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </Field>
          <Field label="Status">
            <select name="supplier_status" defaultValue={defaults.supplier_status} className="h-7 w-full rounded border border-input bg-background px-2">
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </Field>

          <Field label="Notes" colSpan2>
            <textarea name="notes" defaultValue={defaults.notes} className="min-h-[52px] w-full rounded border border-input bg-background px-2 py-1.5" />
          </Field>
        </div>

        {error && <p className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-8">
            Cancel
          </Button>
          <Button type="submit" disabled={pending} style={{ backgroundColor: "var(--navbar)" }} className="h-8 text-white">
            {pending ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Field({
  label,
  children,
  colSpan2,
}: {
  label: string;
  children: ReactNode;
  colSpan2?: boolean;
}) {
  return (
    <label className={`space-y-1 ${colSpan2 ? "col-span-2" : ""}`}>
      <span className="block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
