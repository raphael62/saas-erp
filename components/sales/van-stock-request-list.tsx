"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Filter, Plus, Search, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  deleteVanStockRequest,
  saveVanStockRequest,
  setVanStockRequestStatus,
  submitVanStockRequestForApproval,
} from "@/app/dashboard/sales/van-stock-requests/actions";

export type VanStockRequest = {
  id: string;
  request_no: string;
  sales_rep_id?: string | null;
  location_id?: string | null;
  request_date: string;
  needed_for_date?: string | null;
  request_type?: string | null;
  status?: string | null;
  notes?: string | null;
  total_items?: number | null;
  total_qty?: number | null;
  created_at?: string | null;
  sales_reps?: { id: string; code?: string | null; name: string } | null;
  locations?: { id: string; code?: string | null; name: string } | null;
};

export type VanStockRequestLine = {
  id: string;
  van_stock_request_id: string;
  product_id?: string | null;
  product_code_snapshot?: string | null;
  product_name_snapshot?: string | null;
  qty_ctn?: number | null;
  row_no?: number | null;
};

type Rep = { id: string; code?: string | null; name: string };
type Location = { id: string; code?: string | null; name: string };
type Product = { id: string; code?: string | null; name: string };

const REQUEST_TYPES: { value: string; label: string }[] = [
  { value: "top_up", label: "Top Up" },
  { value: "second_load", label: "2nd Load" },
  { value: "returns", label: "Returns" },
  { value: "add_request", label: "+ Add Request" },
];

function repLabel(r: Rep) {
  const c = String(r.code ?? "").trim();
  return c ? `${c} — ${r.name}` : r.name;
}

function locLabel(l: Location) {
  const c = String(l.code ?? "").trim();
  return c ? `${c} — ${l.name}` : l.name;
}

function typeLabel(t: string | null | undefined) {
  return REQUEST_TYPES.find((x) => x.value === t)?.label ?? t ?? "—";
}

function statusBadge(status: string | null | undefined) {
  const s = String(status ?? "draft");
  const map: Record<string, string> = {
    draft: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    pending_approval: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    approved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    rejected: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  };
  return map[s] ?? "bg-muted text-foreground";
}

function typeBadge(t: string | null | undefined) {
  const s = String(t ?? "");
  const map: Record<string, string> = {
    top_up: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
    second_load: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
    returns: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
    add_request: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  };
  return map[s] ?? "bg-muted";
}

type EditLine = { key: string; product_id: string; code: string; name: string; product_label: string; qty: string };

function blankLine(k: string): EditLine {
  return { key: k, product_id: "", code: "", name: "", product_label: "", qty: "" };
}

function productLabel(p: Product) {
  const c = String(p.code ?? "").trim();
  return c ? `${c} — ${p.name}` : p.name;
}

function n(v: string) {
  const x = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
}

type LoadOutSheetRef = { id: string; sales_rep_id?: string | null; location_id?: string | null; sales_date?: string | null };
type LoadOutLineRef = { load_out_sheet_id: string; product_id?: string | null };

export function VanStockRequestList({
  requests = [],
  lines = [],
  reps = [],
  locations = [],
  products = [],
  loadOutSheets = [],
  loadOutLines = [],
  editId,
}: {
  requests: VanStockRequest[];
  lines: VanStockRequestLine[];
  reps: Rep[];
  locations: Location[];
  products: Product[];
  loadOutSheets?: LoadOutSheetRef[];
  loadOutLines?: LoadOutLineRef[];
  editId?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [requestNo, setRequestNo] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [requestDate, setRequestDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [neededFor, setNeededFor] = useState("");
  const [requestType, setRequestType] = useState("top_up");
  const [notes, setNotes] = useState("");
  const [editLines, setEditLines] = useState<EditLine[]>([blankLine("0"), blankLine("1"), blankLine("2")]);
  const [productDropdownRow, setProductDropdownRow] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadoutProductIdsByKey = useMemo(() => {
    const keyBySheetId = new Map<string, string>();
    for (const s of loadOutSheets ?? []) {
      const repId = String(s.sales_rep_id ?? "").trim();
      const locId = String(s.location_id ?? "").trim();
      const date = String(s.sales_date ?? "").slice(0, 10);
      if (!repId || !locId || !date) continue;
      keyBySheetId.set(s.id, `${repId}|${locId}|${date}`);
    }
    const pidsByKey = new Map<string, Set<string>>();
    for (const l of loadOutLines ?? []) {
      const sheetId = String(l.load_out_sheet_id ?? "");
      const pid = String(l.product_id ?? "").trim();
      if (!sheetId || !pid) continue;
      const key = keyBySheetId.get(sheetId);
      if (!key) continue;
      const set = pidsByKey.get(key) ?? new Set();
      set.add(pid);
      pidsByKey.set(key, set);
    }
    return pidsByKey;
  }, [loadOutSheets, loadOutLines]);

  const productsForReturns = useMemo(() => {
    const date = (neededFor || requestDate).trim().slice(0, 10);
    if (!salesRepId || !locationId || !date) return [];
    const key = `${salesRepId}|${locationId}|${date}`;
    const pids = loadoutProductIdsByKey.get(key);
    if (!pids || pids.size === 0) return [];
    return products.filter((p) => pids.has(String(p.id)));
  }, [salesRepId, locationId, neededFor, requestDate, loadoutProductIdsByKey, products]);

  const effectiveProducts = requestType === "returns" ? productsForReturns : products;

  function filterProducts(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) return effectiveProducts;
    return effectiveProducts.filter((p) => productLabel(p).toLowerCase().includes(q));
  }

  const editingRow = editingId ? requests.find((x) => x.id === editingId) : undefined;
  const isPending = editingRow?.status === "pending_approval";
  const canEditLines = !editingId || editingRow?.status !== "approved";

  const linesByReq = useMemo(() => {
    const m = new Map<string, VanStockRequestLine[]>();
    for (const l of lines) {
      const id = String(l.van_stock_request_id);
      const arr = m.get(id) ?? [];
      arr.push(l);
      m.set(id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => Number(a.row_no ?? 0) - Number(b.row_no ?? 0));
    return m;
  }, [lines]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return requests;
    return requests.filter((r) => {
      const rep = r.sales_reps?.name ?? "";
      const loc = r.locations?.name ?? "";
      return (
        r.request_no.toLowerCase().includes(t) ||
        rep.toLowerCase().includes(t) ||
        loc.toLowerCase().includes(t)
      );
    });
  }, [requests, q]);

  const counts = useMemo(() => {
    let draft = 0,
      pending = 0,
      approved = 0,
      rejected = 0;
    for (const r of requests) {
      const s = String(r.status ?? "draft");
      if (s === "draft") draft++;
      else if (s === "pending_approval") pending++;
      else if (s === "approved") approved++;
      else if (s === "rejected") rejected++;
    }
    return { draft, pending, approved, rejected };
  }, [requests]);

  const openNew = useCallback(() => {
    setEditingId(null);
    setRequestNo("");
    setSalesRepId("");
    setLocationId("");
    setRequestDate(new Date().toISOString().slice(0, 10));
    setNeededFor("");
    setRequestType("top_up");
    setNotes("");
    setEditLines([blankLine("0"), blankLine("1"), blankLine("2")]);
    setMsg(null);
    setOpen(true);
  }, []);

  const openEdit = useCallback(
    (r: VanStockRequest) => {
      setEditingId(r.id);
      setRequestNo(r.request_no);
      setSalesRepId(String(r.sales_rep_id ?? ""));
      setLocationId(String(r.location_id ?? ""));
      setRequestDate(String(r.request_date ?? "").slice(0, 10));
      setNeededFor(String(r.needed_for_date ?? "").slice(0, 10));
      setRequestType(String(r.request_type ?? "top_up"));
      setNotes(String(r.notes ?? ""));
      const ls = linesByReq.get(r.id) ?? [];
      const next: EditLine[] =
        ls.length > 0
          ? ls.map((l, i) => {
              const code = String(l.product_code_snapshot ?? "");
              const name = String(l.product_name_snapshot ?? "");
              return {
                key: String(i),
                product_id: String(l.product_id ?? ""),
                code,
                name,
                product_label: code ? `${code} — ${name}` : name,
                qty: l.qty_ctn != null ? String(l.qty_ctn) : "",
              };
            })
          : [blankLine("0"), blankLine("1"), blankLine("2")];
      setEditLines(ensureTrailingBlank(next));
      setMsg(null);
      setOpen(true);
    },
    [linesByReq]
  );

  useEffect(() => {
    if (editId) {
      const r = requests.find((x) => x.id === editId);
      if (r) openEdit(r);
    }
  }, [editId, requests, openEdit]);

  useEffect(() => {
    if (requestType !== "returns") return;
    if (productsForReturns.length === 0) {
      if (!editingId) setEditLines([]);
      return;
    }
    setEditLines((prev) => {
      const merged = productsForReturns.map((p) => {
        const existing = prev.find((l) => l.product_id === p.id);
        return {
          key: p.id,
          product_id: String(p.id),
          code: String(p.code ?? ""),
          name: p.name,
          product_label: productLabel(p),
          qty: existing?.qty ?? "",
        };
      });
      return merged;
    });
  }, [requestType, productsForReturns, editingId]);

  function ensureTrailingBlank(rows: EditLine[]): EditLine[] {
    if (requestType === "returns") return rows.map((line, i) => ({ ...line, key: String(i) }));
    const list = [...rows];
    if (list.length === 0) list.push(blankLine("0"));
    const last = list[list.length - 1];
    if (last.product_id || n(last.qty) > 0) {
      list.push(blankLine(String(list.length)));
    }
    return list.map((line, i) => ({ ...line, key: String(i) }));
  }

  function setProduct(idx: number, p: Product) {
    setEditLines((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        product_id: String(p.id),
        code: String(p.code ?? ""),
        name: p.name,
        product_label: productLabel(p),
      };
      return ensureTrailingBlank(next);
    });
    setProductDropdownRow(null);
  }

  function totalQty() {
    return editLines.reduce((s, l) => s + n(l.qty), 0);
  }

  async function handleSave(submitApproval: boolean) {
    setSaving(true);
    setMsg(null);
    const fd = new FormData();
    if (editingId) fd.set("id", editingId);
    if (requestNo) fd.set("request_no", requestNo);
    fd.set("sales_rep_id", salesRepId);
    fd.set("location_id", locationId);
    fd.set("request_date", requestDate);
    if (neededFor) fd.set("needed_for_date", neededFor);
    fd.set("request_type", requestType);
    fd.set("notes", notes);
    editLines.forEach((l, i) => {
      if (!l.product_id) return;
      fd.set(`line_product_id_${i}`, l.product_id);
      fd.set(`line_product_code_${i}`, l.code);
      fd.set(`line_product_name_${i}`, l.name);
      fd.set(`line_qty_ctn_${i}`, String(n(l.qty)));
    });
    const res = submitApproval ? await submitVanStockRequestForApproval(fd) : await saveVanStockRequest(fd);
    setSaving(false);
    if ("error" in res && res.error) {
      setMsg(res.error);
      return;
    }
    setOpen(false);
    router.replace("/dashboard/sales/van-stock-requests");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Van Stock Requests</h1>
          <p className="text-muted-foreground mt-1 text-sm">Request and approve stock for van loading.</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          New Stock Request
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ["Draft", counts.draft],
            ["Pending approval", counts.pending],
            ["Approved", counts.approved],
            ["Rejected", counts.rejected],
          ] as const
        ).map(([label, c]) => (
          <div key={label} className="rounded-lg border border-border bg-card px-4 py-3 text-center shadow-sm">
            <div className="text-2xl font-semibold tabular-nums">{c}</div>
            <div className="text-muted-foreground text-xs font-medium">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by request #, rep, location..."
            className="border-input bg-background h-9 w-full rounded-md border pl-9 pr-3 text-sm"
          />
        </div>
        <Button type="button" variant="outline" size="sm" disabled className="gap-1">
          <Filter className="h-4 w-4" />
          Filters
        </Button>
        <Button type="button" variant="outline" size="sm" disabled>
          Export
        </Button>
      </div>

      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase tracking-wide">
              <th className="px-3 py-2">Request #</th>
              <th className="px-3 py-2">Request date</th>
              <th className="px-3 py-2">Needed for</th>
              <th className="px-3 py-2 text-right">Items</th>
              <th className="px-3 py-2 text-right">Total qty</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-muted-foreground px-3 py-10 text-center">
                  No van stock requests yet.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const lc = linesByReq.get(r.id)?.length ?? Number(r.total_items ?? 0);
                const tq = Number(r.total_qty ?? 0);
                return (
                  <tr key={r.id} className="border-b border-border hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{r.request_no}</td>
                    <td className="px-3 py-2">{r.request_date}</td>
                    <td className="px-3 py-2">{r.needed_for_date ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{lc}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{tq.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(r.status)}`}>
                        {String(r.status ?? "draft").replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge(r.request_type)}`}>
                        {typeLabel(r.request_type)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="View / edit"
                          onClick={() => {
                            setMsg(null);
                            openEdit(r);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {(r.status === "draft" || r.status === "rejected") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive h-8 w-8"
                            title="Delete"
                            onClick={async () => {
                              if (!confirm("Delete this request?")) return;
                              const res = await deleteVanStockRequest(r.id);
                              if ("error" in res && res.error) alert(res.error);
                              else router.refresh();
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) router.replace("/dashboard/sales/van-stock-requests");
        }}
        title={editingId ? `Edit ${requestNo}` : "New Van Stock Request"}
        subtitle="Fill in rep, location, products and quantities."
        contentClassName="max-w-3xl"
        bodyClassName="max-h-[85vh] overflow-y-auto p-4"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave(false);
          }}
        >
          {msg && (
            <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{msg}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {REQUEST_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                disabled={!canEditLines}
                onClick={() => setRequestType(t.value)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  requestType === t.value
                    ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/30"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                {requestType === t.value && <Check className="mr-1 inline h-4 w-4" />}
                {t.label}
              </button>
            ))}
          </div>
          {requestType === "returns" && (
            <p className="text-muted-foreground text-xs">
              Returns only: products are restricted to items already on the loadout sheet for this rep, location and date (Needed for).
              {effectiveProducts.length === 0 && salesRepId && locationId && (neededFor || requestDate) && (
                <span className="mt-1 block font-medium text-amber-700 dark:text-amber-400">
                  No loadout sheet for this rep/location/date — create and sync one first.
                </span>
              )}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Sales rep</label>
              <select
                required
                disabled={!canEditLines}
                value={salesRepId}
                onChange={(e) => setSalesRepId(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">Select sales rep</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {repLabel(r)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Location</label>
              <select
                required
                disabled={!canEditLines}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">Select location</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {locLabel(l)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Request date</label>
              <input
                type="date"
                required
                disabled={!canEditLines}
                value={requestDate}
                onChange={(e) => setRequestDate(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Needed for</label>
              <input
                type="date"
                disabled={!canEditLines}
                value={neededFor}
                onChange={(e) => setNeededFor(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium">Notes</label>
            <textarea
              value={notes}
              disabled={!canEditLines}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="border-input bg-background w-full rounded-md border px-2 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
              <div className="text-muted-foreground text-xs">Products</div>
              <div className="text-lg font-semibold">
                {editLines.filter((l) => l.product_id).length}
              </div>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-center dark:border-sky-900 dark:bg-sky-950/40">
              <div className="text-xs font-medium text-sky-800 dark:text-sky-200">
                Total {requestType === "top_up" ? "Top Up" : ""} Qty
              </div>
              <div className="text-sky-900 text-xl font-bold tabular-nums dark:text-sky-100">
                {totalQty().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b text-left text-xs">
                  <th className="px-2 py-2 w-8">#</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2 w-28">Qty (Ctn)</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {editLines.map((line, idx) => (
                  <tr key={line.key} className="border-b border-border">
                    <td className="px-2 py-1.5 text-muted-foreground">{idx + 1}</td>
                    <td className="px-2 py-1.5">
                      {requestType === "returns" ? (
                        <div className="border-input bg-muted/30 text-foreground min-h-[2rem] rounded border px-2 py-1 text-sm">
                          {line.product_label || "—"}
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            id={`product-${idx}`}
                            value={line.product_label}
                            onChange={(e) => {
                              const q = e.target.value;
                              setEditLines((prev) => {
                                const next = [...prev];
                                next[idx] = {
                                  ...next[idx],
                                  product_label: q,
                                  product_id: "",
                                  code: "",
                                  name: "",
                                };
                                return next;
                              });
                              setProductDropdownRow(idx);
                            }}
                            onFocus={() => setProductDropdownRow(idx)}
                            onBlur={() => {
                              setTimeout(() => {
                                setProductDropdownRow((prev) => (prev === idx ? null : prev));
                              }, 120);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const matches = filterProducts(line.product_label);
                                if (matches.length > 0) {
                                  e.preventDefault();
                                  setProduct(idx, matches[0]);
                                  const qtyInput = document.getElementById(`qty-${idx}`) as HTMLInputElement | null;
                                  qtyInput?.focus();
                                  qtyInput?.select();
                                }
                              }
                            }}
                            placeholder="Type code or product name..."
                            disabled={!canEditLines}
                            className="border-input bg-background max-w-full rounded border px-1 py-1 text-sm"
                          />
                          {productDropdownRow === idx && filterProducts(line.product_label).length > 0 && (
                            <div className="absolute left-0 top-full z-[80] mt-0.5 max-h-48 min-w-[24rem] overflow-auto rounded border border-border bg-background shadow-xl">
                              {filterProducts(line.product_label)
                                .slice(0, 30)
                                .map((p) => (
                                  <button
                                    key={String(p.id)}
                                    type="button"
                                    className="w-full whitespace-nowrap px-2.5 py-2 text-left text-sm font-medium hover:bg-muted/80"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setProduct(idx, p)}
                                  >
                                    {productLabel(p)}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        id={`qty-${idx}`}
                        disabled={!canEditLines}
                        value={line.qty}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditLines((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], qty: v };
                            return requestType === "returns" ? next : ensureTrailingBlank(next);
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const nextProductInput = document.getElementById(`product-${idx + 1}`) as HTMLInputElement | null;
                            if (nextProductInput) {
                              nextProductInput.focus();
                              nextProductInput.select();
                            }
                          }
                        }}
                        className="border-input bg-background w-full rounded border px-2 py-1 text-right tabular-nums"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-1">
                      {requestType !== "returns" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={!canEditLines}
                          className="text-destructive h-8 w-8"
                          onClick={() => {
                            setEditLines((prev) => {
                              const next = prev.filter((_, i) => i !== idx);
                              return ensureTrailingBlank(next.length ? next : [blankLine("0")]);
                            });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {requestType !== "returns" && (
            <Button
              type="button"
              variant="link"
              disabled={!canEditLines}
              className="h-auto p-0 text-primary"
              onClick={() =>
                setEditLines((prev) => ensureTrailingBlank([...prev, blankLine(String(prev.length))]))
              }
            >
              + Add Product
            </Button>
          )}

          {isPending && (
            <div className="flex flex-wrap gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="w-full text-sm font-medium text-amber-900 dark:text-amber-200">Pending approval</p>
              <Button
                type="button"
                size="sm"
                className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={async () => {
                  const res = await setVanStockRequestStatus(editingId!, "approved");
                  if ("error" in res && res.error) alert(res.error);
                  else {
                    setOpen(false);
                    router.refresh();
                  }
                }}
              >
                <Check className="h-4 w-4" />
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="gap-1"
                onClick={async () => {
                  const res = await setVanStockRequestStatus(editingId!, "rejected");
                  if ("error" in res && res.error) alert(res.error);
                  else {
                    setOpen(false);
                    router.refresh();
                  }
                }}
              >
                <X className="h-4 w-4" />
                Reject
              </Button>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {!editingId && (
              <>
                <Button type="button" variant="secondary" disabled={saving} onClick={() => void handleSave(false)}>
                  Save draft
                </Button>
                <Button type="button" disabled={saving} className="gap-1" onClick={() => void handleSave(true)}>
                  <Send className="h-4 w-4" />
                  Submit for approval
                </Button>
              </>
            )}
            {editingId && canEditLines && (
              <>
                <Button type="submit" disabled={saving}>
                  Save changes
                </Button>
                <Button type="button" disabled={saving} className="gap-1" onClick={() => void handleSave(true)}>
                  <Send className="h-4 w-4" />
                  Submit for approval
                </Button>
              </>
            )}
          </div>
        </form>
      </Dialog>
    </div>
  );
}
