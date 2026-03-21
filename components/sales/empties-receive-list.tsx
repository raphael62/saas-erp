"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, FileSpreadsheet, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  deleteEmptiesReceive,
  getCustomerEmptiesSnapshot,
  getSuggestedReceiveNo,
  saveEmptiesReceive,
} from "@/app/dashboard/sales/empties-receive/actions";

type Receive = {
  id: string;
  receive_no: string;
  empties_receipt_no?: string | null;
  customer_id?: string | null;
  location_id?: string | null;
  receive_date: string;
  notes?: string | null;
  total_items?: number | null;
  total_received_qty?: number | null;
  total_os_qty?: number | null;
  status?: string | null;
  created_at?: string | null;
  customers?: { id: string; name: string } | null;
  locations?: { id: string; code?: string | null; name: string } | null;
};

type ReceiveLine = {
  id: string;
  empties_receive_id: string;
  product_id?: string | null;
  product_code_snapshot?: string | null;
  product_name_snapshot?: string | null;
  sold_qty?: number | null;
  owed_qty?: number | null;
  expected_qty?: number | null;
  received_qty?: number | null;
  os_qty?: number | null;
  row_no?: number | null;
};

type Customer = { id: string; name: string };
type Location = { id: string; code?: string | null; name: string };
type Product = { id: string | number; code?: string | null; name: string };
type SortCol = "receive_no" | "receive_date" | "customer" | "total_items" | "total_received_qty";

type EditLine = {
  key: string;
  product_id: string;
  product_code: string;
  product_name: string;
  sold_qty: string;
  owed_qty: string;
  expected_qty: string;
  received_qty: string;
  os_qty: string;
};

function n(v: string | number | null | undefined) {
  const raw = String(v ?? "").replace(/,/g, "").trim();
  const num = Number(raw || 0);
  return Number.isFinite(num) ? num : 0;
}

function fmtComma(value: number | string | null | undefined, fixed = 2) {
  return n(value).toLocaleString(undefined, {
    minimumFractionDigits: fixed,
    maximumFractionDigits: fixed,
  });
}

function fmtCommaInput(value: string | number | null | undefined, fixed = 2) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return "";
  const num = Number(raw);
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: fixed,
    maximumFractionDigits: fixed,
  });
}

function blankLine(key: string): EditLine {
  return {
    key,
    product_id: "",
    product_code: "",
    product_name: "",
    sold_qty: "",
    owed_qty: "",
    expected_qty: "",
    received_qty: "",
    os_qty: "",
  };
}

function hasLineData(line: EditLine) {
  return Boolean(line.product_id || n(line.received_qty) > 0 || n(line.expected_qty) > 0 || n(line.owed_qty) > 0);
}

function computeLine(line: EditLine): EditLine {
  const owed = n(line.owed_qty);
  const expected = n(line.expected_qty);
  const sold = n(line.sold_qty);
  const received = n(line.received_qty);
  const os = owed + expected - sold - received;
  return { ...line, os_qty: os.toFixed(4) };
}

export function EmptiesReceiveList({
  receives = [],
  lines = [],
  customers = [],
  locations = [],
  products = [],
  editId,
}: {
  receives: Receive[];
  lines: ReceiveLine[];
  customers: Customer[];
  locations: Location[];
  products: Product[];
  editId?: string;
}) {
  const router = useRouter();
  const openEditId = editId && receives.some((r) => r.id === editId) ? editId : null;

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState<SortCol>("receive_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(openEditId);
  const [showForm, setShowForm] = useState(Boolean(openEditId));
  const [editingId, setEditingId] = useState<string | null>(openEditId);
  const [message, setMessage] = useState<string | null>(null);

  const lineMap = useMemo(() => {
    const map = new Map<string, ReceiveLine[]>();
    for (const line of lines) {
      if (!map.has(line.empties_receive_id)) map.set(line.empties_receive_id, []);
      map.get(line.empties_receive_id)!.push(line);
    }
    return map;
  }, [lines]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = receives.filter((row) => {
      if (fromDate && row.receive_date < fromDate) return false;
      if (toDate && row.receive_date > toDate) return false;
      if (!q) return true;
      return (
        String(row.receive_no ?? "").toLowerCase().includes(q) ||
        String(row.customers?.name ?? "").toLowerCase().includes(q) ||
        String(row.locations?.name ?? "").toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      const av =
        sortCol === "receive_no"
          ? a.receive_no
          : sortCol === "receive_date"
            ? a.receive_date
            : sortCol === "customer"
              ? a.customers?.name ?? ""
              : sortCol === "total_items"
                ? Number(a.total_items ?? 0)
                : Number(a.total_received_qty ?? 0);
      const bv =
        sortCol === "receive_no"
          ? b.receive_no
          : sortCol === "receive_date"
            ? b.receive_date
            : sortCol === "customer"
              ? b.customers?.name ?? ""
              : sortCol === "total_items"
                ? Number(b.total_items ?? 0)
                : Number(b.total_received_qty ?? 0);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [receives, search, fromDate, toDate, sortCol, sortDir]);

  const totalRecords = filtered.length;
  const totalQty = useMemo(() => filtered.reduce((sum, row) => sum + Number(row.total_received_qty ?? 0), 0), [filtered]);

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const selected = filtered.find((x) => x.id === selectedId) ?? null;
  const editing = filtered.find((x) => x.id === editingId) ?? null;

  useEffect(() => {
    if (openEditId) window.history.replaceState(null, "", "/dashboard/sales/empties-receive");
  }, [openEditId]);

  async function handleDelete() {
    if (!selected) return;
    if (!confirm("Delete this empties receive?")) return;
    const result = await deleteEmptiesReceive(selected.id);
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    setMessage("Empties receive deleted.");
    setSelectedId(null);
    router.refresh();
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortCol(col);
    setSortDir("asc");
  }

  const SortIcon = ({ active }: { active: boolean }) =>
    active ? (
      sortDir === "asc" ? (
        <ChevronUp className="h-3.5 w-3.5" />
      ) : (
        <ChevronDown className="h-3.5 w-3.5" />
      )
    ) : (
      <ChevronDown className="h-3.5 w-3.5 opacity-40" />
    );

  const hideList = Boolean(openEditId) && showForm;

  return (
    <div className="space-y-3">
      {!hideList && (
        <>
          <div>
            <h1 className="text-2xl font-semibold">Empties Receive</h1>
            <p className="text-sm text-muted-foreground">Receive physical empties from customers and increase stock at location.</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-border bg-card px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Total Records</p>
              <p className="text-lg font-semibold">{fmtComma(totalRecords, 0)}</p>
            </div>
            <div className="rounded border border-border bg-card px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Total Received Qty</p>
              <p className="text-lg font-semibold">{fmtComma(totalQty, 2)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search receive/customer/location"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-8 w-72 rounded border border-input bg-background px-2.5 text-sm"
            />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded border border-input bg-background px-2 text-xs"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded border border-input bg-background px-2 text-xs"
            />
          </div>

          {message && <p className="rounded border border-border bg-muted/30 px-3 py-1.5 text-sm">{message}</p>}

          <div className="max-h-[calc(100vh-20rem)] overflow-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("receive_no")}>
                      Receive No <SortIcon active={sortCol === "receive_no"} />
                    </button>
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("receive_date")}>
                      Receive Date <SortIcon active={sortCol === "receive_date"} />
                    </button>
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("customer")}>
                      Customer Name <SortIcon active={sortCol === "customer"} />
                    </button>
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>Location</th>
                  <th className="border-b border-r border-border px-2 py-2 text-right font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <button type="button" className="ml-auto flex items-center gap-1" onClick={() => toggleSort("total_items")}>
                      Total Items <SortIcon active={sortCol === "total_items"} />
                    </button>
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-right font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <button type="button" className="ml-auto flex items-center gap-1" onClick={() => toggleSort("total_received_qty")}>
                      Total Receive Qty <SortIcon active={sortCol === "total_received_qty"} />
                    </button>
                  </th>
                  <th className="border-b border-border px-2 py-2 text-left font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  No empties receive records found.
                </td>
              </tr>
            ) : (
              paginated.map((row, i) => {
                const active = selectedId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={`cursor-pointer border-b border-border last:border-0 ${
                      active
                        ? "bg-muted/60"
                        : i % 2 === 0
                          ? "bg-background hover:bg-muted/20"
                          : "bg-muted/30 hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="border-r border-border px-2 py-2">
                      <button
                        type="button"
                        className="text-left text-[var(--navbar)] hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(row.id);
                          setShowForm(true);
                        }}
                      >
                        {row.receive_no}
                      </button>
                    </td>
                    <td className="border-r border-border px-2 py-2">{row.receive_date}</td>
                    <td className="border-r border-border px-2 py-2">{row.customers?.name ?? "—"}</td>
                    <td className="border-r border-border px-2 py-2">{row.locations?.name ?? "—"}</td>
                    <td className="border-r border-border px-2 py-2 text-right">{fmtComma(row.total_items, 0)}</td>
                    <td className="border-r border-border px-2 py-2 text-right">{fmtComma(row.total_received_qty, 2)}</td>
                    <td className="border-border px-2 py-2">{String(row.status ?? "saved")}</td>
                  </tr>
                );
              })
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
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </Button>
          <span>
            Page {page} / {totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
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
        <Button size="sm" variant="outline" disabled={!selected} onClick={handleDelete}>
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
        <Button size="sm" variant="outline" disabled>
          <Printer className="h-4 w-4" />
          Print
        </Button>
        <Button size="sm" variant="outline" disabled>
          <FileSpreadsheet className="h-4 w-4" />
          Excel
        </Button>
      </div>
        </>
      )}

      <EmptiesReceiveFormDialog
        open={showForm}
        onOpenChange={(next) => {
          setShowForm(next);
          if (!next) setEditingId(null);
        }}
        onSaved={() => router.refresh()}
        customers={customers}
        locations={locations}
        products={products}
        initialReceive={editing}
        initialLines={editing ? lineMap.get(editing.id) ?? [] : []}
      />
    </div>
  );
}

function EmptiesReceiveFormDialog({
  open,
  onOpenChange,
  onSaved,
  customers = [],
  locations = [],
  products = [],
  initialReceive = null,
  initialLines = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  customers?: Customer[];
  locations?: Location[];
  products?: Product[];
  initialReceive?: Receive | null;
  initialLines?: ReceiveLine[];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllTypes, setShowAllTypes] = useState(false);

  const [receiveNo, setReceiveNo] = useState("");
  const [receiveNoTouched, setReceiveNoTouched] = useState(false);
  const [emptiesReceiptNo, setEmptiesReceiptNo] = useState("");
  const [receiveDate, setReceiveDate] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);
  const [emptiesDropdownIdx, setEmptiesDropdownIdx] = useState<number | null>(null);
  const customerRef = useRef<HTMLDivElement>(null);
  const emptiesDropdownRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) map.set(String(p.id), p);
    return map;
  }, [products]);
  const filteredCustomers = useMemo(() => {
    const q = customerQuery.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter((c) => String(c.name ?? "").toLowerCase().includes(q));
  }, [customers, customerQuery]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowAllTypes(false);
    setReceiveNo(initialReceive?.receive_no ?? "");
    setReceiveNoTouched(Boolean(initialReceive?.id || initialReceive?.receive_no));
    setEmptiesReceiptNo(initialReceive?.empties_receipt_no ?? "");
    setReceiveDate(initialReceive?.receive_date ?? new Date().toISOString().slice(0, 10));
    const initialCustomerId = initialReceive?.customer_id ?? "";
    setCustomerId(initialCustomerId);
    const initialCustomer = customers.find((c) => c.id === initialCustomerId);
    setCustomerQuery(initialCustomer?.name ?? "");
    setShowCustomerDropdown(false);
    setLocationId(initialReceive?.location_id ?? "");
    setNotes(initialReceive?.notes ?? "");

    const seeded = (initialLines ?? [])
      .sort((a, b) => Number(a.row_no ?? 0) - Number(b.row_no ?? 0))
      .map((line, i) => ({
        key: String(i),
        product_id: String(line.product_id ?? ""),
        product_code: String(line.product_code_snapshot ?? ""),
        product_name: String(line.product_name_snapshot ?? ""),
        sold_qty: n(line.sold_qty).toFixed(4),
        owed_qty: n(line.owed_qty).toFixed(4),
        expected_qty: n(line.expected_qty).toFixed(4),
        received_qty: n(line.received_qty).toFixed(4),
        os_qty: n(line.os_qty).toFixed(4),
      }));
    if (seeded.length === 0) setLines([blankLine("0")]);
    else setLines([...seeded, blankLine(String(seeded.length))]);
  }, [open, initialReceive, initialLines, customers]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (customerRef.current && !customerRef.current.contains(target)) setShowCustomerDropdown(false);
      if (emptiesDropdownIdx !== null) {
        const ref = emptiesDropdownRefs.current.get(emptiesDropdownIdx);
        if (ref && !ref.contains(target)) setEmptiesDropdownIdx(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [emptiesDropdownIdx]);

  useEffect(() => {
    if (!open) return;
    if (initialReceive?.id) return;
    if (receiveNoTouched) return;
    if (!receiveDate) return;
    const timer = setTimeout(async () => {
      const res = await getSuggestedReceiveNo(receiveDate.slice(0, 10));
      if (res?.ok && res.receiveNo) setReceiveNo(res.receiveNo);
    }, 180);
    return () => clearTimeout(timer);
  }, [open, initialReceive?.id, receiveNoTouched, receiveDate]);

  async function loadCustomerRows(nextCustomerId: string, nextReceiveDate: string, includeAll: boolean) {
    if (!nextCustomerId || !nextReceiveDate) {
      setLines([blankLine("0")]);
      return;
    }
    const res = await getCustomerEmptiesSnapshot(nextCustomerId, nextReceiveDate, includeAll, initialReceive?.id ?? undefined);
    if (!res?.ok || !Array.isArray(res.rows)) {
      setError(res?.error ?? "Unable to load customer empties.");
      return;
    }
    const mapped = res.rows.map((row, i) => ({
      key: String(i),
      product_id: String(row.product_id),
      product_code: row.product_code,
      product_name: row.product_name,
      sold_qty: n(row.sold_qty).toFixed(4),
      owed_qty: n(row.owed_qty).toFixed(4),
      expected_qty: n(row.expected_qty).toFixed(4),
      received_qty: "",
      os_qty: n(row.os_qty).toFixed(4),
    }));
    setLines(mapped.length > 0 ? [...mapped, blankLine(String(mapped.length))] : [blankLine("0")]);
  }

  async function selectCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const selected = customers.find((c) => c.id === nextCustomerId);
    setCustomerQuery(selected?.name ?? "");
    setShowCustomerDropdown(false);
    await loadCustomerRows(nextCustomerId, receiveDate, showAllTypes);
  }

  function applyEmptiesProduct(index: number, product: Product) {
    updateLine(index, {
      product_id: String(product.id),
      product_code: String(product.code ?? ""),
      product_name: product.name,
    });
    setEmptiesDropdownIdx(null);
  }

  function updateLine(index: number, patch: Partial<EditLine>) {
    setLines((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = computeLine({ ...current, ...patch });
      const last = next[next.length - 1];
      if (last && hasLineData(last)) next.push(blankLine(String(next.length)));
      return next;
    });
  }

  const totals = useMemo(() => {
    let sold = 0;
    let owed = 0;
    let expected = 0;
    let received = 0;
    let os = 0;
    for (const line of lines) {
      sold += n(line.sold_qty);
      owed += n(line.owed_qty);
      expected += n(line.expected_qty);
      received += n(line.received_qty);
      os += n(line.os_qty);
    }
    return { sold, owed, expected, received, os };
  }, [lines]);

  async function submit(closeAfterSave: boolean) {
    setPending(true);
    setError(null);

    const fd = new FormData();
    if (initialReceive?.id) fd.set("id", initialReceive.id);
    if (receiveNo) fd.set("receive_no", receiveNo);
    if (emptiesReceiptNo) fd.set("empties_receipt_no", emptiesReceiptNo);
    fd.set("customer_id", customerId);
    fd.set("location_id", locationId);
    fd.set("receive_date", receiveDate);
    if (notes) fd.set("notes", notes);

    let row = 0;
    for (const line of lines) {
      const hasData = line.product_id || n(line.owed_qty) > 0 || n(line.expected_qty) > 0 || n(line.received_qty) > 0;
      if (!hasData) continue;
      fd.set(`line_product_id_${row}`, line.product_id || "");
      fd.set(`line_product_code_${row}`, line.product_code || "");
      fd.set(`line_product_name_${row}`, line.product_name || "");
      fd.set(`line_sold_qty_${row}`, line.sold_qty || "0");
      fd.set(`line_owed_qty_${row}`, line.owed_qty || "0");
      fd.set(`line_expected_qty_${row}`, line.expected_qty || "0");
      fd.set(`line_received_qty_${row}`, line.received_qty || "0");
      fd.set(`line_os_qty_${row}`, line.os_qty || "0");
      row += 1;
    }

    const result = await saveEmptiesReceive(fd);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }

    onSaved();
    if (closeAfterSave) {
      onOpenChange(false);
      return;
    }

    setReceiveNo("");
    setReceiveNoTouched(false);
    setEmptiesReceiptNo("");
    setReceiveDate(new Date().toISOString().slice(0, 10));
    setCustomerId("");
    setCustomerQuery("");
    setShowCustomerDropdown(false);
    setLocationId("");
    setNotes("");
    setShowAllTypes(false);
    setLines([blankLine("0")]);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialReceive?.id ? "Edit Empties Receive" : "New Empties Receive"}
      contentClassName="max-w-[1060px]"
      bodyClassName="max-h-[86vh] overflow-y-auto p-3"
    >
      <div className="space-y-3 text-sm">
        {error && <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}

        <div className="grid grid-cols-3 gap-x-4 gap-y-2 [&_input]:text-sm [&_select]:text-sm">
          <div>
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Receive No.
            </label>
            <input
              value={receiveNo}
              onChange={(e) => {
                const next = e.target.value;
                setReceiveNo(next);
                setReceiveNoTouched(next.trim().length > 0);
              }}
              className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
              placeholder="Auto-generated"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Empties Receipt No
            </label>
            <input
              value={emptiesReceiptNo}
              onChange={(e) => setEmptiesReceiptNo(e.target.value)}
              className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
              placeholder="Manual receipt number"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Receive Date *
            </label>
            <input
              type="date"
              value={receiveDate}
              onChange={async (e) => {
                const nextDate = e.target.value;
                setReceiveDate(nextDate);
                if (customerId && nextDate) {
                  await loadCustomerRows(customerId, nextDate, showAllTypes);
                }
              }}
              className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
            />
          </div>

          <div>
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Customer *
            </label>
            <div className="relative" ref={customerRef}>
              <input
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setCustomerId("");
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredCustomers.length > 0) {
                    e.preventDefault();
                    void selectCustomer(filteredCustomers[0].id);
                  }
                }}
                className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
                placeholder="Type to filter customer"
                autoComplete="off"
              />
              {showCustomerDropdown && filteredCustomers.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded border border-border bg-background shadow-lg">
                  {filteredCustomers.slice(0, 30).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void selectCustomer(c.id)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Location *
            </label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
            >
              <option value="">Select location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {(l.code ? `${l.code} - ` : "") + l.name}
                </option>
              ))}
            </select>
          </div>
          <div />

          <div className="col-span-3">
            <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
              Notes
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
            />
          </div>
        </div>

        <div className="rounded border border-border">
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-2 py-1 text-[11px]">
            <span className="font-medium text-muted-foreground">Customer Empties — Owed, Expected, Receive &amp; O/S</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              onClick={async () => {
                const next = !showAllTypes;
                setShowAllTypes(next);
                await loadCustomerRows(customerId, receiveDate, next);
              }}
            >
              {showAllTypes ? "Hide zero types" : "Show all types"}
            </Button>
          </div>
          <table className="w-full table-fixed text-xs">
            <thead>
              <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <th className="border-b border-r border-border px-1 py-1 text-left" style={{ width: 110 }}>Empties</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 110 }}>Owed</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 110 }}>Expected</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 110 }}>Sold</th>
                <th className="border-b border-r border-border px-1 py-1 text-right" style={{ width: 110 }}>Received</th>
                <th className="border-b border-border px-1 py-1 text-right" style={{ width: 110 }}>O/S</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const nameQuery = (line.product_name || "").toLowerCase().trim();
                const emptiesMatches = nameQuery
                  ? products.filter((p) =>
                      p.name.toLowerCase().includes(nameQuery) ||
                      (p.code ?? "").toLowerCase().includes(nameQuery)
                    )
                  : products;
                return (
                <tr key={line.key} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <div className="relative" ref={(el) => { emptiesDropdownRefs.current.set(idx, el); }}>
                      <input
                        value={line.product_name}
                        onChange={(e) => {
                          updateLine(idx, { product_name: e.target.value, product_id: "", product_code: "" });
                          setEmptiesDropdownIdx(idx);
                        }}
                        onFocus={() => setEmptiesDropdownIdx(idx)}
                        onBlur={() => {
                          setTimeout(() => {
                            setEmptiesDropdownIdx((prev) => (prev === idx ? null : prev));
                          }, 150);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && emptiesMatches.length > 0) {
                            e.preventDefault();
                            applyEmptiesProduct(idx, emptiesMatches[0]);
                          }
                        }}
                        className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-[11px] font-medium outline-none focus:bg-background"
                        placeholder="Type to filter empties"
                        autoComplete="off"
                      />
                      {emptiesDropdownIdx === idx && emptiesMatches.length > 0 && (
                        <div className="absolute left-0 top-full z-[80] mt-0.5 max-h-48 min-w-[20rem] overflow-auto rounded border border-border bg-background shadow-xl">
                          {emptiesMatches.slice(0, 20).map((p) => (
                            <button
                              key={String(p.id)}
                              type="button"
                              className="w-full whitespace-nowrap px-2.5 py-2 text-left text-sm font-medium hover:bg-muted/80"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => applyEmptiesProduct(idx, p)}
                            >
                              {(p.code ? `${p.code} - ` : "") + p.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <input value={fmtComma(line.owed_qty, 4)} readOnly className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right text-xs" />
                  </td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <input value={fmtComma(line.expected_qty, 4)} readOnly className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right text-xs" />
                  </td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <input value={fmtComma(line.sold_qty, 4)} readOnly className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right text-xs" />
                  </td>
                  <td className="border-b border-r border-border px-1 py-0.5">
                    <input
                      value={line.received_qty}
                      onChange={(e) => updateLine(idx, { received_qty: e.target.value })}
                      onBlur={(e) => updateLine(idx, { received_qty: fmtCommaInput(e.target.value, 4) })}
                      className="h-7 w-full rounded-none border-0 bg-transparent px-1 text-right text-xs outline-none focus:bg-background"
                    />
                  </td>
                  <td className="border-b border-border px-1 py-0.5">
                    <input value={fmtComma(line.os_qty, 4)} readOnly className="h-7 w-full rounded-none border-0 bg-muted/30 px-1 text-right text-xs" />
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-semibold">
                <td className="border-t border-r border-border px-2 py-1 text-right" />
                <td className="border-t border-r border-border px-2 py-1 text-right">{fmtComma(totals.owed, 2)}</td>
                <td className="border-t border-r border-border px-2 py-1 text-right">{fmtComma(totals.expected, 2)}</td>
                <td className="border-t border-r border-border px-2 py-1 text-right">{fmtComma(totals.sold, 2)}</td>
                <td className="border-t border-r border-border px-2 py-1 text-right">{fmtComma(totals.received, 2)}</td>
                <td className="border-t border-border px-2 py-1 text-right">{fmtComma(totals.os, 2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="rounded border border-border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
          On save, stock increases at selected location. Value is not used for customer balances.
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-2">
          <Button size="sm" style={{ backgroundColor: "#bf1d2d" }} className="text-white" onClick={() => submit(true)} disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
          <Button size="sm" style={{ backgroundColor: "#1976d2" }} className="text-white" onClick={() => submit(false)} disabled={pending}>
            Save &amp; New
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
