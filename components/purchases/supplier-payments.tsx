"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileSpreadsheet, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  deleteSupplierPayment,
  getOutstandingInvoices,
  getSupplierOutstanding,
  getSuggestedPaymentNo,
  saveBatchSupplierPayment,
  saveSupplierPayment,
} from "@/app/dashboard/accounting/supplier-payments/actions";
import {
  clearSupplierStatementEditQueue,
  peekSupplierStatementEditForCurrentPage,
} from "@/lib/statement-edit-bridge";

type Supplier = {
  id: string;
  code?: string | null;
  name?: string | null;
  tax_id?: string | null;
};

type PaymentMethod = { code?: string | null; name?: string | null };

type Payment = {
  id: string;
  payment_no: string;
  supplier_id: string;
  payment_date: string;
  bank_date?: string | null;
  payment_account?: string | null;
  payment_method?: string | null;
  amount: number;
  reference?: string | null;
  notes?: string | null;
  cheque_no?: string | null;
  purchase_invoice_id?: string | null;
  suppliers?: { id?: string | null; name?: string | null; code?: string | null } | null;
};

function fmtMoney(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function supplierLabel(s: Supplier) {
  const code = String(s.code ?? s.tax_id ?? "").trim();
  const name = String(s.name ?? "").trim();
  return code ? `${code} - ${name}` : name;
}

type SupplierPaymentsProps = {
  payments: Payment[];
  suppliers: Supplier[];
  paymentMethods: PaymentMethod[];
  paymentAccounts: string[];
  paymentsMissing?: boolean;
  editId?: string;
};

function SupplierPaymentsContent({
  payments = [],
  suppliers = [],
  paymentMethods = [],
  paymentAccounts = [],
  paymentsMissing = false,
  editId,
}: SupplierPaymentsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const urlEditRaw = searchParams.get("edit");
  const urlEdit = typeof urlEditRaw === "string" && urlEditRaw.trim() !== "" ? urlEditRaw.trim() : undefined;
  const propEdit = typeof editId === "string" && editId.trim() !== "" ? editId.trim() : undefined;
  const resolvedEditId = urlEdit ?? propEdit;
  const openEditId =
    resolvedEditId && payments.some((p) => p.id === resolvedEditId) ? resolvedEditId : null;
  const [showSingle, setShowSingle] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showBatch, setShowBatch] = useState(false);

  useEffect(() => {
    if (!openEditId) return;
    setEditingId(openEditId);
    setShowSingle(true);
  }, [openEditId]);

  useEffect(() => {
    const bridged = peekSupplierStatementEditForCurrentPage();
    if (!bridged) return;
    if (!payments.some((p) => p.id === bridged)) {
      if (payments.length > 0) clearSupplierStatementEditQueue();
      return;
    }
    clearSupplierStatementEditQueue();
    setEditingId(bridged);
    setShowSingle(true);
  }, [payments]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return payments;
    return payments.filter(
      (p) =>
        String(p.payment_no ?? "").toLowerCase().includes(q) ||
        String(p.suppliers?.name ?? "").toLowerCase().includes(q) ||
        String(p.payment_method ?? "").toLowerCase().includes(q) ||
        String(p.reference ?? "").toLowerCase().includes(q)
    );
  }, [payments, search]);

  const selected = filtered.find((x) => x.id === selectedId) ?? null;
  const editing = payments.find((x) => x.id === editingId) ?? null;
  /** Hide table when opened via ?edit= (e.g. from supplier statement). */
  const hideList = Boolean(urlEdit) && showSingle;

  async function handleDelete() {
    if (!selected) return;
    if (!confirm("Delete this payment?")) return;
    const res = await deleteSupplierPayment(selected.id);
    if ("error" in res) {
      setMessage(res.error);
      return;
    }
    setMessage("Payment deleted.");
    window.location.reload();
  }

  return (
    <div className="space-y-3">
      {!hideList && (
        <>
          <div className="flex items-end justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold">Supplier Payments</h1>
              <p className="text-sm text-muted-foreground">Record money paid to suppliers.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowBatch(true)}>
                + Batch Payment
              </Button>
              <Button
                size="sm"
                style={{ backgroundColor: "var(--navbar)" }}
                className="text-white"
                onClick={() => {
                  setEditingId(null);
                  setShowSingle(true);
                }}
              >
                <Plus className="h-4 w-4" />
                New Payment
              </Button>
            </div>
          </div>

          {paymentsMissing && (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Supplier payments table is missing. Run <code>supabase/ADD_SUPPLIER_PAYMENTS.sql</code> first.
            </p>
          )}
          {message && <p className="rounded border border-border bg-muted/30 px-3 py-1.5 text-sm">{message}</p>}

          <div className="rounded border border-border bg-card p-2">
            <label className="mb-1 block text-sm text-muted-foreground">Search</label>
            <input
              type="text"
              placeholder="Search by payment no, supplier, method, ref, cheque..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
            />
          </div>

          <div className="max-h-[calc(100vh-18rem)] overflow-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="w-12 border-b border-r border-border px-2 py-2 text-left text-sm font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    #
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-left text-sm font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    PAYMENT NO.
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-left text-sm font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    TRANS DATE
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-left text-sm font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    SUPPLIER
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-left text-sm font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    METHOD
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-left text-sm font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    REF (SUP. INV)
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-left text-sm font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    CHQ
                  </th>
                  <th className="border-b border-border px-2 py-2 text-right text-sm font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    AMOUNT
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No supplier payments found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-b border-border last:border-0 ${
                        selectedId === row.id
                          ? "bg-muted/60"
                          : idx % 2 === 0
                            ? "bg-background hover:bg-muted/20"
                            : "bg-muted/30 hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td className="border-r border-border px-2 py-1.5 text-sm">{idx + 1}</td>
                      <td className="border-r border-border px-2 py-1.5 text-sm">
                        <button
                          type="button"
                          className="text-sm text-[var(--navbar)] hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(row.id);
                            setShowSingle(true);
                          }}
                        >
                          {row.payment_no}
                        </button>
                      </td>
                      <td className="border-r border-border px-2 py-1.5 text-sm">{row.payment_date}</td>
                      <td className="border-r border-border px-2 py-1.5 text-sm">{row.suppliers?.name ?? "—"}</td>
                      <td className="border-r border-border px-2 py-1.5 text-sm">{row.payment_method ?? "Cash"}</td>
                      <td className="border-r border-border px-2 py-1.5 text-sm">{row.reference?.trim() ? row.reference : "—"}</td>
                      <td className="border-r border-border px-2 py-1.5 text-sm">{row.cheque_no?.trim() ? row.cheque_no : "—"}</td>
                      <td className="px-2 py-1.5 text-right text-sm">{fmtMoney(row.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-3 py-2">
            <Button
              size="sm"
              style={{ backgroundColor: "var(--navbar)" }}
              className="text-white"
              onClick={() => {
                setEditingId(null);
                setShowSingle(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowBatch(true)}>
              Batch Payment
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

      <SinglePaymentDialog
        open={showSingle}
        onOpenChange={(next) => {
          setShowSingle(next);
          if (!next) {
            setEditingId(null);
            if (searchParams.get("edit")) {
              router.replace("/dashboard/accounting/supplier-payments", { scroll: false });
            }
          }
        }}
        suppliers={suppliers}
        paymentMethods={paymentMethods}
        paymentAccounts={paymentAccounts}
        initialPayment={editing}
        onSaved={() => window.location.reload()}
      />

      <BatchPaymentDialog
        open={showBatch}
        onOpenChange={setShowBatch}
        suppliers={suppliers}
        paymentMethods={paymentMethods}
        paymentAccounts={paymentAccounts}
        onSaved={() => window.location.reload()}
      />
    </div>
  );
}

export function SupplierPayments(props: SupplierPaymentsProps) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading payments…</div>}>
      <SupplierPaymentsContent {...props} />
    </Suspense>
  );
}

function SinglePaymentDialog({
  open,
  onOpenChange,
  suppliers,
  paymentMethods,
  paymentAccounts,
  initialPayment,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: Supplier[];
  paymentMethods: PaymentMethod[];
  paymentAccounts: string[];
  initialPayment: Payment | null;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentNo, setPaymentNo] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [outstanding, setOutstanding] = useState(0);
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [bankDate, setBankDate] = useState(todayIso());
  const [paymentAccount, setPaymentAccount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0]?.name || "Cash");
  const [amountValue, setAmountValue] = useState(0);
  const [amountFocus, setAmountFocus] = useState(false);
  const [reference, setReference] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [notes, setNotes] = useState("");
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const supplierRef = useRef<HTMLDivElement | null>(null);

  const filteredSuppliers = useMemo(() => {
    const q = supplierQuery.toLowerCase().trim();
    if (!q) return suppliers.slice(0, 20);
    return suppliers.filter((s) => supplierLabel(s).toLowerCase().includes(q)).slice(0, 20);
  }, [suppliers, supplierQuery]);

  async function refreshOutstanding(nextSupplierId: string, nextDate: string, excludeId?: string) {
    if (!nextSupplierId || !nextDate) {
      setOutstanding(0);
      return;
    }
    const res = await getSupplierOutstanding(nextSupplierId, nextDate, excludeId);
    if ("error" in res) return;
    setOutstanding(Number(res.outstanding ?? 0));
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    const initDate = initialPayment?.payment_date || todayIso();
    setPaymentDate(initDate);
    setBankDate(initialPayment?.bank_date || initDate);
    setPaymentAccount(String(initialPayment?.payment_account ?? ""));
    setPaymentMethod(String(initialPayment?.payment_method ?? paymentMethods[0]?.name ?? "Cash"));
    setAmountValue(Number(initialPayment?.amount ?? 0) || 0);
    setAmountFocus(false);
    setReference(String(initialPayment?.reference ?? ""));
    setChequeNo(String(initialPayment?.cheque_no ?? ""));
    setNotes(String(initialPayment?.notes ?? ""));
    setPaymentNo(String(initialPayment?.payment_no ?? ""));
    const sid = String(initialPayment?.supplier_id ?? "");
    setSupplierId(sid);
    const s = suppliers.find((x) => x.id === sid);
    const label = s
      ? supplierLabel(s)
      : initialPayment?.suppliers?.name
        ? [initialPayment.suppliers.code, initialPayment.suppliers.name].filter(Boolean).join(" - ") || String(initialPayment.suppliers.name)
        : "";
    setSupplierQuery(label);
    void refreshOutstanding(sid, initDate, initialPayment?.id);
  }, [open, initialPayment, suppliers, paymentMethods]);

  useEffect(() => {
    if (!open || initialPayment?.id) return;
    let alive = true;
    void (async () => {
      const res = await getSuggestedPaymentNo(paymentDate);
      if (!alive || "error" in res) return;
      setPaymentNo(res.payment_no);
    })();
    return () => { alive = false; };
  }, [open, initialPayment?.id, paymentDate]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) setShowSupplierDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Supplier Payment"
      showGearIcon={false}
      contentClassName="max-w-[920px] text-sm"
      bodyClassName="max-h-[80vh] overflow-auto p-4"
    >
      <div className="space-y-3 text-sm">
        {error && <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">{error}</p>}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-3">
            <div ref={supplierRef}>
              <label className="mb-1 block text-sm text-muted-foreground">Supplier</label>
              <input
                value={supplierQuery}
                onChange={(e) => {
                  setSupplierQuery(e.target.value);
                  setShowSupplierDropdown(true);
                }}
                onFocus={() => setShowSupplierDropdown(true)}
                placeholder="Type supplier code or name"
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
              />
              {showSupplierDropdown && filteredSuppliers.length > 0 && (
                <div className="mt-1 max-h-48 overflow-auto rounded border border-border bg-popover shadow-md">
                  {filteredSuppliers.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="block w-full px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setSupplierId(s.id);
                        setSupplierQuery(supplierLabel(s));
                        setShowSupplierDropdown(false);
                        void refreshOutstanding(s.id, paymentDate, initialPayment?.id);
                      }}
                    >
                      {supplierLabel(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Transaction Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setPaymentDate(v);
                  void refreshOutstanding(supplierId, v, initialPayment?.id);
                }}
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Bank Account *</label>
              <select
                value={paymentAccount}
                onChange={(e) => setPaymentAccount(e.target.value)}
                required
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
              >
                <option value="">Select bank account</option>
                {paymentAccounts.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Amount</label>
              <input
                type="text"
                inputMode="decimal"
                value={
                  amountFocus
                    ? amountValue === 0
                      ? ""
                      : String(amountValue)
                    : amountValue
                      ? fmtMoney(amountValue)
                      : ""
                }
                onFocus={() => setAmountFocus(true)}
                onBlur={() => setAmountFocus(false)}
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, "").replace(/[^\d.]/g, "");
                  const parts = raw.split(".");
                  const normalized =
                    parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : raw;
                  const n = normalized === "" || normalized === "." ? 0 : Number(normalized);
                  setAmountValue(Number.isFinite(n) ? n : 0);
                }}
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm text-right tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                rows={2}
                className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Outstanding Balance</label>
              <input
                value={fmtMoney(outstanding)}
                readOnly
                className="h-8 w-full rounded border border-input bg-muted/30 px-2 text-sm text-right tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Bank Date</label>
              <input
                type="date"
                value={bankDate}
                onChange={(e) => setBankDate(e.target.value)}
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
              >
                {paymentMethods.length === 0 ? (
                  <option>Cash</option>
                ) : (
                  paymentMethods.map((m) => {
                    const v = String(m.name ?? m.code ?? "Cash");
                    return (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    );
                  })
                )}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Reference (Supp. Inv No.)</label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Supplier invoice number"
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Cheque No.</label>
              <input
                value={chequeNo}
                onChange={(e) => setChequeNo(e.target.value)}
                placeholder="Optional"
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <Button
            size="sm"
            style={{ backgroundColor: "var(--navbar)" }}
            className="text-white"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError(null);
              const res = await saveSupplierPayment({
                id: initialPayment?.id,
                supplier_id: supplierId,
                payment_date: paymentDate,
                bank_date: bankDate,
                payment_account: paymentAccount,
                payment_method: paymentMethod,
                amount: amountValue,
                reference,
                notes,
                cheque_no: chequeNo,
                purchase_invoice_id: initialPayment?.purchase_invoice_id ?? undefined,
              });
              setPending(false);
              if ("error" in res) {
                setError(res.error);
                return;
              }
              onSaved();
              onOpenChange(false);
            }}
          >
            Save Payment
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

type OutstandingInvoice = {
  id: string;
  invoice_no: string;
  supplier_inv_no?: string | null;
  invoice_date: string;
  grand_total: number;
  balance_os: number;
};

function supplierInvDisplay(inv: OutstandingInvoice) {
  const s = String(inv.supplier_inv_no ?? "").trim();
  return s || inv.invoice_no;
}

function BatchPaymentDialog({
  open,
  onOpenChange,
  suppliers,
  paymentMethods,
  paymentAccounts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: Supplier[];
  paymentMethods: PaymentMethod[];
  paymentAccounts: string[];
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [bankDate, setBankDate] = useState(todayIso());
  const [supplierId, setSupplierId] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [outstanding, setOutstanding] = useState(0);
  const [paymentAccount, setPaymentAccount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0]?.name || "Cash");
  const [notes, setNotes] = useState("");
  const [invoices, setInvoices] = useState<OutstandingInvoice[]>([]);
  const [allocations, setAllocations] = useState<Record<string, { amount: number; cheque_no: string }>>({});
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [focusPaymentRowId, setFocusPaymentRowId] = useState<string | null>(null);
  const supplierRef = useRef<HTMLDivElement | null>(null);

  const filteredSuppliers = useMemo(() => {
    const q = supplierQuery.toLowerCase().trim();
    if (!q) return suppliers.slice(0, 20);
    return suppliers.filter((s) => supplierLabel(s).toLowerCase().includes(q)).slice(0, 20);
  }, [suppliers, supplierQuery]);

  const totalPayment = useMemo(() => {
    return Object.values(allocations).reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  }, [allocations]);

  async function loadSupplierData(sid: string) {
    if (!sid) {
      setInvoices([]);
      setOutstanding(0);
      setAllocations({});
      return;
    }
    const [outRes, invRes] = await Promise.all([
      getSupplierOutstanding(sid),
      getOutstandingInvoices(sid),
    ]);
    if ("error" in outRes) return;
    setOutstanding(Number(outRes.outstanding ?? 0));
    if ("error" in invRes) return;
    const invList = (invRes.invoices ?? []) as OutstandingInvoice[];
    setInvoices(invList);
    setAllocations(
      invList.reduce(
        (acc, inv) => ({ ...acc, [inv.id]: { amount: 0, cheque_no: "" } }),
        {} as Record<string, { amount: number; cheque_no: string }>
      )
    );
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPaymentDate(todayIso());
    setBankDate(todayIso());
    setSupplierId("");
    setSupplierQuery("");
    setOutstanding(0);
    setPaymentAccount("");
    setPaymentMethod(paymentMethods[0]?.name || "Cash");
    setNotes("");
    setInvoices([]);
    setAllocations({});
    setFocusPaymentRowId(null);
  }, [open, paymentMethods]);

  useEffect(() => {
    setFocusPaymentRowId(null);
    if (supplierId) void loadSupplierData(supplierId);
    else {
      setInvoices([]);
      setOutstanding(0);
      setAllocations({});
    }
  }, [supplierId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) setShowSupplierDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Batch Supplier Payment"
      showGearIcon={false}
      contentClassName="max-w-[1320px] text-sm"
      bodyClassName="max-h-[85vh] overflow-auto p-4"
    >
      <div className="space-y-3">
        {error && <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">{error}</p>}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="md:col-span-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div ref={supplierRef}>
              <label className="mb-1 block text-sm text-muted-foreground">Supplier</label>
              <input
                value={supplierQuery}
                onChange={(e) => {
                  setSupplierQuery(e.target.value);
                  setShowSupplierDropdown(true);
                }}
                onFocus={() => setShowSupplierDropdown(true)}
                placeholder="Type supplier code or name"
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
              />
              {showSupplierDropdown && filteredSuppliers.length > 0 && (
                <div className="mt-1 max-h-48 overflow-auto rounded border border-border bg-popover shadow-md">
                  {filteredSuppliers.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="block w-full px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setSupplierId(s.id);
                        setSupplierQuery(supplierLabel(s));
                        setShowSupplierDropdown(false);
                      }}
                    >
                      {supplierLabel(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Transaction Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Bank Date</label>
              <input
                type="date"
                value={bankDate}
                onChange={(e) => setBankDate(e.target.value)}
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
              />
            </div>
          </div>
          <div className="md:col-span-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Bank Account *</label>
              <select
                value={paymentAccount}
                onChange={(e) => setPaymentAccount(e.target.value)}
                required
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
              >
                <option value="">Select account</option>
                {paymentAccounts.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
              >
                {paymentMethods.length === 0 ? (
                  <option>Cash</option>
                ) : (
                  paymentMethods.map((m) => {
                    const v = String(m.name ?? m.code ?? "Cash");
                    return (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    );
                  })
                )}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Outstanding Balance</label>
              <input
                value={fmtMoney(outstanding)}
                readOnly
                className="h-8 w-full rounded border border-input bg-muted/30 px-2 text-sm text-right tabular-nums"
              />
            </div>
          </div>
        </div>

        <div className="overflow-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="w-10 border-b border-r border-border px-2 py-1.5 font-medium">Pay</th>
                <th className="w-24 border-b border-r border-border px-2 py-1.5 text-left font-medium">Date</th>
                <th className="w-36 border-b border-r border-border px-2 py-1.5 text-left font-medium">Supp. Inv No.</th>
                <th className="w-28 border-b border-r border-border px-2 py-1.5 text-right font-medium">Value</th>
                <th className="w-28 border-b border-r border-border px-2 py-1.5 text-right font-medium">Owed</th>
                <th className="w-32 border-b border-r border-border px-2 py-1.5 text-right font-medium">Payment</th>
                <th className="w-32 border-b border-border px-2 py-1.5 text-left font-medium">Cheque No.</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    Select a supplier to see outstanding invoices.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const alloc = allocations[inv.id] ?? { amount: 0, cheque_no: "" };
                  const isChecked = (alloc.amount || 0) > 0;
                  return (
                    <tr key={inv.id} className="border-b border-border last:border-0">
                      <td className="border-r border-border px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setAllocations((prev) => ({
                              ...prev,
                              [inv.id]: {
                                ...prev[inv.id],
                                amount: checked ? inv.balance_os : 0,
                                cheque_no: (prev[inv.id]?.cheque_no ?? "").trim(),
                              },
                            }));
                          }}
                          className="rounded"
                        />
                      </td>
                      <td className="border-r border-border px-2 py-1.5">{inv.invoice_date}</td>
                      <td className="border-r border-border px-2 py-1.5">{supplierInvDisplay(inv)}</td>
                      <td className="border-r border-border px-2 py-1.5 text-right">{fmtMoney(inv.grand_total)}</td>
                      <td className="border-r border-border px-2 py-1.5 text-right">{fmtMoney(inv.balance_os)}</td>
                      <td className="border-r border-border px-2 py-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={
                            focusPaymentRowId === inv.id
                              ? alloc.amount === 0
                                ? ""
                                : String(alloc.amount)
                              : alloc.amount
                                ? fmtMoney(alloc.amount)
                                : ""
                          }
                          onFocus={() => setFocusPaymentRowId(inv.id)}
                          onBlur={() => setFocusPaymentRowId(null)}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/,/g, "").replace(/[^\d.]/g, "");
                            const parts = raw.split(".");
                            const normalized =
                              parts.length > 2
                                ? `${parts[0]}.${parts.slice(1).join("")}`
                                : raw;
                            const n = normalized === "" || normalized === "." ? 0 : Number(normalized);
                            setAllocations((prev) => ({
                              ...prev,
                              [inv.id]: {
                                ...prev[inv.id],
                                amount: Number.isFinite(n) ? n : 0,
                                cheque_no: (prev[inv.id]?.cheque_no ?? "").trim(),
                              },
                            }));
                          }}
                          className="h-8 w-full rounded border-0 bg-transparent px-1 text-right text-sm tabular-nums focus:bg-muted"
                        />
                      </td>
                      <td className="border-border px-2 py-1.5">
                        <input
                          value={alloc.cheque_no}
                          onChange={(e) =>
                            setAllocations((prev) => ({
                              ...prev,
                              [inv.id]: {
                                ...prev[inv.id],
                                amount: prev[inv.id]?.amount ?? 0,
                                cheque_no: e.target.value,
                              },
                            }))
                          }
                          placeholder="Optional"
                          className="h-8 w-full rounded border-0 bg-transparent px-1 text-sm focus:bg-muted"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {invoices.length > 0 && (
              <tfoot>
                <tr className="bg-muted/40 font-semibold">
                  <td className="border-t border-r border-border px-2 py-1.5" colSpan={5} />
                  <td className="border-t border-r border-border px-2 py-1.5 text-right tabular-nums">
                    {fmtMoney(totalPayment)}
                  </td>
                  <td className="border-t border-border px-2 py-1.5" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="flex items-center justify-between">
          <Button
            size="sm"
            style={{ backgroundColor: "var(--navbar)" }}
            className="text-white"
            disabled={pending || !supplierId || !paymentAccount || totalPayment <= 0}
            onClick={async () => {
              setPending(true);
              setError(null);
              const allocList = invoices
                .filter((inv) => (allocations[inv.id]?.amount || 0) > 0)
                .map((inv) => {
                  const a = allocations[inv.id] ?? { amount: 0, cheque_no: "" };
                  return {
                    purchase_invoice_id: inv.id,
                    amount: Number(a.amount),
                    cheque_no: (a.cheque_no || "").trim() || undefined,
                    reference: supplierInvDisplay(inv),
                  };
                });
              const res = await saveBatchSupplierPayment({
                supplier_id: supplierId,
                payment_date: paymentDate,
                bank_date: bankDate,
                payment_account: paymentAccount,
                payment_method: paymentMethod,
                notes: notes || undefined,
                allocations: allocList,
              });
              setPending(false);
              if ("error" in res) {
                setError(res.error);
                return;
              }
              onSaved();
              onOpenChange(false);
            }}
          >
            Save Batch
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
