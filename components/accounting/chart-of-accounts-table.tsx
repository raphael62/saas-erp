"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  deleteChartOfAccount,
  saveChartOfAccount,
} from "@/app/dashboard/accounting/chart-of-accounts/actions";

type Account = {
  id: string;
  parent_id: string | null;
  account_code: string;
  account_name: string;
  account_type: string;
  sub_type: string | null;
  dr_cr?: string;
  opening_balance_ghs: number;
  current_balance_ghs: number;
  is_active: boolean;
};

const ACCOUNT_TYPES = [
  "Asset",
  "Liability",
  "Equity",
  "Revenue",
  "Cost of Goods Sold",
  "Expense",
] as const;

const TYPE_BG: Record<string, string> = {
  Asset: "bg-sky-100 dark:bg-sky-950/40",
  Liability: "bg-rose-100 dark:bg-rose-950/40",
  Equity: "bg-violet-100 dark:bg-violet-950/40",
  Revenue: "bg-emerald-100 dark:bg-emerald-950/40",
  "Cost of Goods Sold": "bg-amber-100 dark:bg-amber-950/40",
  Expense: "bg-yellow-100 dark:bg-yellow-950/40",
};

function fmtMoney(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type TreeNode = Account & { children: TreeNode[] };

function buildTree(accounts: Account[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const a of accounts) {
    byId.set(a.id, { ...a, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const a of accounts) {
    const node = byId.get(a.id)!;
    if (!a.parent_id) {
      roots.push(node);
    } else {
      const parent = byId.get(a.parent_id);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  roots.sort((a, b) => a.account_code.localeCompare(b.account_code));
  function sortChildren(n: TreeNode) {
    n.children.sort((a, b) => a.account_code.localeCompare(b.account_code));
    n.children.forEach(sortChildren);
  }
  roots.forEach(sortChildren);
  return roots;
}

function flattenWithDepth(
  nodes: TreeNode[],
  depth: number,
  expandedIds: Set<string>
): { node: TreeNode; depth: number }[] {
  const out: { node: TreeNode; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.children.length > 0 && expandedIds.has(n.id)) {
      out.push(...flattenWithDepth(n.children, depth + 1, expandedIds));
    }
  }
  return out;
}

function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q.trim()) return nodes;
  const lower = q.toLowerCase();
  const result: TreeNode[] = [];
  for (const n of nodes) {
    const matches =
      n.account_code.toLowerCase().includes(lower) ||
      n.account_name.toLowerCase().includes(lower) ||
      (n.account_type || "").toLowerCase().includes(lower) ||
      (n.sub_type || "").toLowerCase().includes(lower);
    const filteredChildren = filterTree(n.children, q);
    if (matches || filteredChildren.length > 0) {
      result.push({ ...n, children: filteredChildren });
    }
  }
  return result;
}

export function ChartOfAccountsTable({
  accounts = [],
  tableMissing = false,
}: {
  accounts: Account[];
  tableMissing?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [parentIdForNew, setParentIdForNew] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(accounts), [accounts]);
  const filteredTree = useMemo(() => filterTree(tree, search), [tree, search]);

  useEffect(() => {
    if (search.trim()) {
      const ids = new Set<string>();
      function collect(nodes: TreeNode[]) {
        for (const n of nodes) {
          ids.add(n.id);
          collect(n.children);
        }
      }
      collect(filteredTree);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [search, filteredTree]);

  const flatFiltered = useMemo(() => {
    return flattenWithDepth(filteredTree, 0, expandedIds);
  }, [filteredTree, expandedIds]);

  const editingAccount = useMemo(
    () => (editingId ? accounts.find((a) => a.id === editingId) : null),
    [accounts, editingId]
  );

  const parentAccount = useMemo(
    () => (parentIdForNew ? accounts.find((a) => a.id === parentIdForNew) : null),
    [accounts, parentIdForNew]
  );

  const openNew = useCallback((parentId?: string | null) => {
    setEditingId(null);
    setParentIdForNew(parentId ?? null);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((id: string) => {
    setEditingId(id);
    setParentIdForNew(null);
    setShowForm(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openNew();
      }
      if (e.key === "F3" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        (document.querySelector('input[placeholder="Search..."]') as HTMLInputElement)?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openNew]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    const ids = new Set<string>();
    function collect(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.children.length > 0) {
          ids.add(n.id);
          collect(n.children);
        }
      }
    }
    collect(filteredTree);
    setExpandedIds(ids);
  }

  function collapseAll() {
    setExpandedIds(new Set());
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const result = await saveChartOfAccount(formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setShowForm(false);
    setEditingId(null);
    setParentIdForNew(null);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this account? This cannot be undone.")) return;
    setPending(true);
    const result = await deleteChartOfAccount(id);
    setPending(false);
    if (result?.error) setError(result.error);
    else router.refresh();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === flatFiltered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(flatFiltered.map(({ node }) => node.id)));
    }
  }

  if (tableMissing) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Chart of accounts table is not set up. Run{" "}
        <code className="rounded bg-muted px-1.5 py-0.5">ADD_CHART_OF_ACCOUNTS.sql</code> in
        Supabase SQL Editor, then{" "}
        <code className="rounded bg-muted px-1.5 py-0.5">MIGRATE_CHART_OF_ACCOUNTS_TO_TREE.sql</code>
        .
      </div>
    );
  }

  return (
    <div className="max-w-[1320px] space-y-4">
      <p className="text-sm text-muted-foreground">
        Ghana GRA-compliant account structure — Assets (1xxx), Liabilities (2xxx), Equity (3xxx),
        Revenue (4xxx), COGS (5xxx), Expenses (6xxx)
      </p>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => openNew()}
          className="bg-[var(--navbar)] text-white hover:bg-[var(--navbar)]/90"
        >
          <Plus className="h-4 w-4" />
          New (F2)
        </Button>
        <Button size="sm" variant="outline" onClick={() => openEdit(selectedId!)} disabled={!selectedId}>
          <Pencil className="h-4 w-4" />
          Change
        </Button>
        <Button size="sm" variant="outline" disabled={selectedIds.size === 0}>
          <Trash2 className="h-4 w-4" />
          Deactive/Reactivate
        </Button>
        <Button size="sm" variant="outline" disabled>
          <FileSpreadsheet className="h-4 w-4" />
          Excel
        </Button>
        <Button size="sm" variant="outline" onClick={expandAll}>
          Expand All
        </Button>
        <Button size="sm" variant="outline" onClick={collapseAll}>
          Collapse All
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <input
            id="coa-search"
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            className="bg-violet-600 text-white hover:bg-violet-700"
            onClick={() => document.getElementById("coa-search")?.focus()}
          >
            <Search className="h-4 w-4" />
            Search (F3)
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {/* Tree Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={
                      flatFiltered.length > 0 && selectedIds.size === flatFiltered.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded"
                    aria-label="Select all"
                  />
                </th>
                <th className="min-w-[280px] px-3 py-2 text-left font-medium">
                  [Account Code] Account Name
                </th>
                <th className="px-3 py-2 text-left font-medium">Account</th>
                <th className="w-16 px-3 py-2 text-left font-medium">Dr./Cr.</th>
                <th className="px-3 py-2 text-left font-medium">Account Category</th>
                <th className="px-3 py-2 text-left font-medium">Valuation Type</th>
                <th className="w-24 px-3 py-2 text-left font-medium">Usage Status</th>
                <th className="px-3 py-2 text-left font-medium">Remark</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Opening Bal GHS</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Current Bal GHS</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {flatFiltered.map(({ node: acc, depth }) => {
                const hasChildren = acc.children.length > 0;
                const isLeaf = !hasChildren;
                const isExpanded = expandedIds.has(acc.id);
                const isSelected = selectedId === acc.id;

                return (
                  <tr
                    key={acc.id}
                    onClick={() => setSelectedId(acc.id)}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer ${
                      TYPE_BG[acc.account_type] ?? ""
                    } ${isSelected ? "bg-violet-200 dark:bg-violet-900/50" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(acc.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelect(acc.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div
                        className="flex items-center gap-1"
                        style={{ paddingLeft: depth * 20 }}
                      >
                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(acc.id);
                            }}
                            className="rounded p-0.5 hover:bg-black/10"
                            aria-label={isExpanded ? "Collapse" : "Expand"}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <span className="w-5" />
                        )}
                        <span className="font-medium">
                          [{acc.account_code}] {acc.account_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openNew(acc.id);
                          }}
                          className="text-[var(--navbar)] underline hover:no-underline"
                        >
                          Add
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">{acc.dr_cr ?? "Dr"}</td>
                    <td className="px-3 py-2">{acc.account_type}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {hasChildren ? "Not applicable" : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {isLeaf ? (
                        <span className="text-green-600 dark:text-green-400">Yes</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isLeaf ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(acc.id);
                          }}
                          className="text-[var(--navbar)] underline hover:no-underline"
                        >
                          Register
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {hasChildren ? "—" : fmtMoney(acc.opening_balance_ghs)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {hasChildren ? "—" : fmtMoney(acc.current_balance_ghs)}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                );
              })}
            </tbody>
          </table>
        </div>
        {flatFiltered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No accounts found. Click New to add a root account.
          </div>
        )}
      </div>

      {/* New/Edit Form Dialog */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) {
            setEditingId(null);
            setParentIdForNew(null);
          }
        }}
        title={
          editingId
            ? "Edit Account"
            : parentIdForNew
              ? "New Sub-Account"
              : "New Account"
        }
        subtitle={
          editingId ? editingAccount?.account_code : parentAccount ? `Under ${parentAccount.account_code}` : undefined
        }
        showGearIcon={false}
        contentClassName="max-w-[520px]"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {editingId && <input type="hidden" name="id" value={editingId} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">Parent Account</label>
              <select
                name="parent_id"
                defaultValue={
                  parentIdForNew ??
                  editingAccount?.parent_id ??
                  ""
                }
                className="h-8 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">(None — Root account)</option>
                {accounts
                  .filter((a) => a.id !== editingId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.account_code}] {a.account_name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Account Code *</label>
              <input
                name="account_code"
                required
                defaultValue={editingAccount?.account_code}
                className="h-8 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="e.g. 1001"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Account Name *</label>
              <input
                name="account_name"
                required
                defaultValue={editingAccount?.account_name}
                className="h-8 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="e.g. Cash at Bank"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Account Category *</label>
              <select
                name="account_type"
                required
                defaultValue={editingAccount?.account_type ?? parentAccount?.account_type ?? "Asset"}
                className="h-8 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Sub Account</label>
              <input
                name="sub_type"
                defaultValue={editingAccount?.sub_type ?? ""}
                className="h-8 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="e.g. Current Assets"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Dr./Cr. *</label>
              <select
                name="dr_cr"
                defaultValue={editingAccount?.dr_cr ?? "Dr"}
                className="h-8 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="Dr">Dr</option>
                <option value="Cr">Cr</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Opening Bal GHS</label>
              <input
                name="opening_balance_ghs"
                type="number"
                step="0.01"
                defaultValue={editingAccount?.opening_balance_ghs ?? 0}
                className="h-8 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                name="is_active"
                id="coa-is-active"
                defaultChecked={editingAccount?.is_active ?? true}
                className="rounded"
              />
              <label htmlFor="coa-is-active" className="text-sm font-medium">
                Active
              </label>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
