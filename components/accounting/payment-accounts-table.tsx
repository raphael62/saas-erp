"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  deletePaymentAccount,
  savePaymentAccount,
} from "@/app/dashboard/accounting/payment-accounts/actions";

type ChartAccount = {
  id: string;
  account_code: string;
  account_name: string;
};

type PaymentAccount = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
  chart_of_account_id?: string | null;
};

const ACCOUNT_TYPES = [
  { value: "bank", label: "Bank" },
  { value: "cash", label: "Cash" },
] as const;

export function PaymentAccountsTable({
  accounts = [],
  chartAccounts = [],
  tableMissing = false,
}: {
  accounts: PaymentAccount[];
  chartAccounts?: ChartAccount[];
  tableMissing?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getChartAccount = useCallback(
    (id: string | null | undefined) =>
      id ? chartAccounts.find((ca) => ca.id === id) : null,
    [chartAccounts]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return accounts;
    return accounts.filter((a) => {
      const ca = getChartAccount(a.chart_of_account_id);
      return (
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.account_type || "").toLowerCase().includes(q) ||
        (ca?.account_name || "").toLowerCase().includes(q) ||
        (ca?.account_code || "").toLowerCase().includes(q)
      );
    });
  }, [accounts, search, getChartAccount]);

  const editingAccount = useMemo(
    () => (editingId ? accounts.find((a) => a.id === editingId) : null),
    [accounts, editingId]
  );

  const openNew = useCallback(() => {
    setEditingId(null);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((id: string) => {
    setEditingId(id);
    setShowForm(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openNew();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openNew]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const result = await savePaymentAccount(formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setShowForm(false);
    setEditingId(null);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this bank/cash account? It may be in use by customer payments.")) return;
    setPending(true);
    const result = await deletePaymentAccount(id);
    setPending(false);
    if (result?.error) setError(result.error);
    else router.refresh();
  }

  if (tableMissing) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Payment accounts table is not set up. Run{" "}
        <code className="rounded bg-muted px-1.5 py-0.5">ADD_PAYMENT_ACCOUNTS.sql</code> in
        Supabase SQL Editor.
      </div>
    );
  }

  return (
    <div className="max-w-[920px] space-y-4">
      <p className="text-sm text-muted-foreground">
        Manage bank accounts and cash books. These appear in the Payment Account dropdown when
        recording customer and supplier payments.
      </p>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={openNew}
          className="bg-[var(--navbar)] text-white hover:bg-[var(--navbar)]/90"
        >
          <Plus className="h-4 w-4" />
          New (F2)
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Bank Account Code</th>
                <th className="px-3 py-2 text-left font-medium">Bank Account Name</th>
                <th className="px-3 py-2 text-left font-medium">Account (Chart of Accounts)</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Active</th>
                <th className="w-20 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((acc, i) => (
                <tr
                  key={acc.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{acc.code}</td>
                  <td className="px-3 py-2">{acc.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {acc.chart_of_accounts
                      ? `${acc.chart_of_accounts.account_name} (${acc.chart_of_accounts.account_code})`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 capitalize">{acc.account_type}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        acc.is_active
                          ? "text-green-600 dark:text-green-400"
                          : "text-muted-foreground"
                      }
                    >
                      {acc.is_active ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(acc.id)}
                        disabled={pending}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(acc.id)}
                        disabled={pending}
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No payment accounts. Click New to add a bank or cash book.
          </div>
        )}
      </div>

      {/* New/Edit Form Dialog */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditingId(null);
        }}
        title={editingId ? "Edit Bank/Cash Account" : "New Bank/Cash Account"}
        subtitle={editingId ? editingAccount?.code : undefined}
        showGearIcon={false}
        contentClassName="max-w-[420px]"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {editingId && <input type="hidden" name="id" value={editingId} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Bank Account Code *</label>
              <input
                name="code"
                required
                defaultValue={editingAccount?.code}
                className="h-8 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="e.g. BANK-MAIN"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Bank Account Name *</label>
              <input
                name="name"
                required
                defaultValue={editingAccount?.name}
                className="h-8 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="e.g. Main Bank Account"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">Account (Chart of Accounts)</label>
              <select
                name="chart_of_account_id"
                defaultValue={editingAccount?.chart_of_account_id ?? ""}
                className="h-8 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select account…</option>
                {chartAccounts.map((ca) => (
                  <option key={ca.id} value={ca.id}>
                    {ca.account_code} {ca.account_name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Link this bank/cash account to a GL account in the Chart of Accounts.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Type *</label>
              <select
                name="account_type"
                required
                defaultValue={editingAccount?.account_type ?? "bank"}
                className="h-8 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                name="is_active"
                id="pa-is-active"
                defaultChecked={editingAccount?.is_active ?? true}
                className="rounded"
              />
              <label htmlFor="pa-is-active" className="text-sm font-medium">
                Active
              </label>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
