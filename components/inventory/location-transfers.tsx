"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  deleteLocationTransfer,
  getSuggestedLocationTransferNo,
  saveLocationTransfer,
  type SaveLocationTransferInput,
} from "@/app/dashboard/inventory/location-transfers/actions";

type Location = { id: string; code?: string | null; name: string };
type Product = { id: string; code?: string | null; name: string; stock_quantity?: number | null; unit?: string | null; pack_unit?: number | null };
type TransferLine = {
  id?: string;
  location_transfer_id?: string;
  product_id: string;
  cartons: number;
  bottles: number;
  ctn_qty: number;
  notes?: string | null;
  row_no: number;
  product?: { id: string; code?: string | null; name: string; pack_unit?: number | null } | null;
};

type LocationTransfer = {
  id: string;
  transfer_no: string;
  transfer_date: string;
  request_date?: string | null;
  from_location_id: string;
  to_location_id: string;
  status?: string | null;
  notes?: string | null;
  from_location?: { id: string; code?: string | null; name: string } | null;
  to_location?: { id: string; code?: string | null; name: string } | null;
  lines?: TransferLine[];
};

function fmtQty(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function locationLabel(l: Location | { code?: string | null; name: string }) {
  const code = String(l.code ?? "").trim();
  const name = String(l.name ?? "").trim();
  return code ? `${code} - ${name}` : name;
}

function productLabel(p: Product | { code?: string | null; name: string }) {
  const code = String(p.code ?? "").trim();
  const name = String(p.name ?? "").trim();
  return code ? `${code} - ${name}` : name;
}

type LocationTransfersProps = {
  transfers: LocationTransfer[];
  locations: Location[];
  products: Product[];
  tableMissing?: boolean;
};

export function LocationTransfers({
  transfers = [],
  locations = [],
  products = [],
  tableMissing = false,
}: LocationTransfersProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return transfers.filter((t) => {
      const status = String(t.status ?? "requested").toLowerCase();
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      return (
        String(t.transfer_no ?? "").toLowerCase().includes(q) ||
        String(t.from_location?.name ?? "").toLowerCase().includes(q) ||
        String(t.to_location?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [transfers, search, statusFilter]);

  const selected = filtered.find((x) => x.id === selectedId) ?? null;
  const editing = transfers.find((x) => x.id === editingId) ?? null;

  async function handleDelete() {
    if (!selected) return;
    if (!confirm("Delete this stock transfer request?")) return;
    const res = await deleteLocationTransfer(selected.id);
    if ("error" in res) {
      setMessage(res.error ?? "Unknown error");
      return;
    }
    setMessage("Stock transfer request deleted.");
    window.location.reload();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stock Transfers</h1>
          <p className="text-sm text-muted-foreground">Request, dispatch, and receive stock between depots.</p>
        </div>
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
          New Request
        </Button>
      </div>

      {tableMissing && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Location transfers table is missing. Run <code>supabase/migrations/044_location_transfers.sql</code> and{" "}
          <code>045_location_transfer_requests_lines.sql</code> first.
        </p>
      )}
      {message && <p className="rounded border border-border bg-muted/30 px-3 py-1.5 text-sm">{message}</p>}

      <div className="grid gap-2 rounded border border-border bg-card p-2 md:grid-cols-[1fr_180px]">
        <input
          type="text"
          placeholder="Search by transfer #, location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 rounded border border-input bg-background px-2.5 text-sm"
        >
          <option value="all">All Statuses</option>
          <option value="requested">Requested</option>
          <option value="approved">Approved</option>
          <option value="dispatched">Dispatched</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="max-h-[calc(100vh-18rem)] overflow-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 12%, white)" }}>
            <tr>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium">Transfer #</th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium">Date</th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium">Location-Out</th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium">Location-In</th>
              <th className="border-b border-r border-border px-2 py-2 text-right font-medium">Items</th>
              <th className="border-b border-border px-2 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No stock transfers found.
                </td>
              </tr>
            ) : (
              filtered.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-b border-border last:border-0 ${
                    selectedId === row.id ? "bg-muted/60" : idx % 2 === 0 ? "bg-background hover:bg-muted/20" : "bg-muted/30 hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="border-r border-border px-2 py-1.5">
                    <button
                      type="button"
                      className="text-[var(--navbar)] hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(row.id);
                        setShowForm(true);
                      }}
                    >
                      {row.transfer_no}
                    </button>
                  </td>
                  <td className="border-r border-border px-2 py-1.5">{String(row.transfer_date ?? row.request_date).slice(0, 10)}</td>
                  <td className="border-r border-border px-2 py-1.5">{locationLabel(row.from_location ?? { name: "—" })}</td>
                  <td className="border-r border-border px-2 py-1.5">{locationLabel(row.to_location ?? { name: "—" })}</td>
                  <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">{row.lines?.length ?? 0}</td>
                  <td className="px-2 py-1.5">
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 capitalize">
                      {row.status ?? "requested"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
        <Button size="sm" variant="outline" disabled={!selected} onClick={handleDelete}>
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>

      <LocationTransferFormDialog
        open={showForm}
        onOpenChange={(next) => {
          setShowForm(next);
          if (!next) setEditingId(null);
        }}
        locations={locations}
        products={products}
        initialTransfer={editing}
        onSaved={() => window.location.reload()}
      />
    </div>
  );
}

function LocationTransferFormDialog({
  open,
  onOpenChange,
  locations,
  products,
  initialTransfer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: Location[];
  products: Product[];
  initialTransfer: LocationTransfer | null;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferNo, setTransferNo] = useState("");
  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0, 10));
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([{ product_id: "", cartons: 0, bottles: 0, ctn_qty: 0, notes: "", row_no: 1 }]);

  function recalcCtnQty(line: TransferLine) {
    const product = products.find((p) => p.id === line.product_id);
    const packUnit = Number(product?.pack_unit ?? 0);
    const ctnQty = packUnit > 0 ? Number((line.cartons + line.bottles / packUnit).toFixed(4)) : Number(line.cartons.toFixed(4));
    return { ...line, ctn_qty: ctnQty };
  }

  function updateLine(idx: number, patch: Partial<TransferLine>) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        return recalcCtnQty({ ...l, ...patch });
      })
    );
  }

  function addRow() {
    setLines((prev) => [...prev, { product_id: "", cartons: 0, bottles: 0, ctn_qty: 0, notes: "", row_no: prev.length + 1 }]);
  }

  function removeRow(idx: number) {
    setLines((prev) => {
      const out = prev.filter((_, i) => i !== idx);
      return out.length === 0 ? [{ product_id: "", cartons: 0, bottles: 0, ctn_qty: 0, notes: "", row_no: 1 }] : out.map((l, i) => ({ ...l, row_no: i + 1 }));
    });
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    const initReq = String(initialTransfer?.request_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    const initTrf = String(initialTransfer?.transfer_date ?? initialTransfer?.request_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    setRequestDate(initReq);
    setTransferDate(initTrf);
    setFromLocationId(String(initialTransfer?.from_location_id ?? ""));
    setToLocationId(String(initialTransfer?.to_location_id ?? ""));
    setNotes(String(initialTransfer?.notes ?? ""));
    setTransferNo(String(initialTransfer?.transfer_no ?? ""));
    const seeded = (initialTransfer?.lines ?? []).map((l, i) => ({
      product_id: String(l.product_id ?? ""),
      cartons: Number(l.cartons ?? 0),
      bottles: Number(l.bottles ?? 0),
      ctn_qty: Number(l.ctn_qty ?? 0),
      notes: String(l.notes ?? ""),
      row_no: i + 1,
    }));
    setLines(seeded.length ? seeded : [{ product_id: "", cartons: 0, bottles: 0, ctn_qty: 0, notes: "", row_no: 1 }]);
  }, [open, initialTransfer]);

  useEffect(() => {
    if (!open || initialTransfer?.id) return;
    let alive = true;
    void (async () => {
      const res = await getSuggestedLocationTransferNo(requestDate);
      if (!alive || "error" in res) return;
      setTransferNo(res.transfer_no);
    })();
    return () => {
      alive = false;
    };
  }, [open, initialTransfer?.id, requestDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const payload: SaveLocationTransferInput = {
      id: initialTransfer?.id,
      request_date: requestDate,
      transfer_date: transferDate,
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      notes,
      lines: lines.map((l, i) => ({
        product_id: l.product_id,
        cartons: Number(l.cartons ?? 0),
        bottles: Number(l.bottles ?? 0),
        ctn_qty: Number(l.ctn_qty ?? 0),
        notes: String(l.notes ?? ""),
        row_no: i + 1,
      })),
    };

    const res = await saveLocationTransfer(payload);
    setPending(false);
    if ("error" in res) {
      setError(res.error ?? "Unknown error");
      return;
    }
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={initialTransfer ? "Edit Stock Transfer Request" : "New Stock Transfer Request"} contentClassName="max-w-5xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-sm text-destructive">{error}</p>}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Location-Out</label>
            <select value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)} required className="h-9 w-full rounded border border-input bg-background px-2.5 text-sm">
              <option value="">Select location-out</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{locationLabel(l)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Location-In</label>
            <select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)} required className="h-9 w-full rounded border border-input bg-background px-2.5 text-sm">
              <option value="">Select location-in</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{locationLabel(l)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Request Date</label>
            <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} required className="h-9 w-full rounded border border-input bg-background px-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Transfer Date</label>
            <input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} required className="h-9 w-full rounded border border-input bg-background px-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Transfer #</label>
            <input type="text" value={transferNo} readOnly className="h-9 w-full rounded border border-input bg-muted/50 px-2.5 text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Notes</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" className="h-9 w-full rounded border border-input bg-background px-2.5 text-sm" />
          </div>
        </div>

        <div className="rounded border border-border">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
            <p className="text-sm font-medium">Items</p>
            <button type="button" className="text-xs font-medium text-[var(--navbar)] hover:underline" onClick={addRow}>
              + Add Row
            </button>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-left">Product</th>
                  <th className="px-2 py-2 text-right">Cartons</th>
                  <th className="px-2 py-2 text-right">Bottles</th>
                  <th className="px-2 py-2 text-right">Ctn Qty</th>
                  <th className="px-2 py-2 text-left">Notes</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={`${idx}-${line.row_no}`} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5">
                      <select
                        value={line.product_id}
                        onChange={(e) => updateLine(idx, { product_id: e.target.value })}
                        className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                      >
                        <option value="">Select product</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {productLabel(p)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.cartons}
                        onChange={(e) => updateLine(idx, { cartons: Number(e.target.value || 0) })}
                        className="h-8 w-24 rounded border border-input bg-background px-2 text-right text-sm"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.bottles}
                        onChange={(e) => updateLine(idx, { bottles: Number(e.target.value || 0) })}
                        className="h-8 w-24 rounded border border-input bg-background px-2 text-right text-sm"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        value={line.ctn_qty}
                        readOnly
                        className="h-8 w-28 rounded border border-input bg-muted/50 px-2 text-right text-sm"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={String(line.notes ?? "")}
                        onChange={(e) => updateLine(idx, { notes: e.target.value })}
                        className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button type="button" onClick={() => removeRow(idx)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={pending} style={{ backgroundColor: "var(--navbar)" }} className="text-white hover:opacity-90">
            {pending ? "Saving..." : initialTransfer ? "Update Request" : "Create Request"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
