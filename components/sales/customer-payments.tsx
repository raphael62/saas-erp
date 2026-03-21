"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  deleteCustomerPayment,
  getCustomerOutstanding,
  getSuggestedPaymentNo,
  saveBatchCustomerPayments,
  saveCustomerPayment,
} from "@/app/dashboard/sales/customer-payments/actions";

type Customer = {
  id: string;
  name?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  contact_person?: string | null;
};

type PaymentMethod = {
  code?: string | null;
  name?: string | null;
};

type Payment = {
  id: string;
  payment_no: string;
  customer_id: string;
  payment_date: string;
  bank_date?: string | null;
  payment_account?: string | null;
  payment_method?: string | null;
  amount: number;
  reference?: string | null;
  notes?: string | null;
  created_at?: string | null;
  customers?: { id?: string | null; name?: string | null; tax_id?: string | null } | null;
};

type BatchRow = {
  key: string;
  customer_id: string;
  customer_query: string;
  prev_bal: number;
  amount: number;
  bank_date: string;
  payment_account: string;
  payment_method: string;
  reference: string;
  notes: string;
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

function clamp2(value: number) {
  return Number(value.toFixed(2));
}

function customerLabel(c: Customer) {
  const code = String(c.tax_id ?? "").trim();
  const name = String(c.name ?? "").trim();
  return code ? `${code} - ${name}` : name;
}

function blankBatchRow(index: number, date: string, method: string) {
  return {
    key: `${Date.now()}-${index}`,
    customer_id: "",
    customer_query: "",
    prev_bal: 0,
    amount: 0,
    bank_date: date,
    payment_account: "",
    payment_method: method,
    reference: "",
    notes: "",
  } as BatchRow;
}

export function CustomerPayments({
  payments = [],
  customers = [],
  paymentMethods = [],
  paymentAccounts = [],
  paymentsMissing = false,
  editId,
}: {
  payments: Payment[];
  customers: Customer[];
  paymentMethods: PaymentMethod[];
  paymentAccounts: string[];
  paymentsMissing?: boolean;
  editId?: string;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const openEditId = editId && payments.some((p) => p.id === editId) ? editId : null;
  const [showSingle, setShowSingle] = useState(Boolean(openEditId));
  const [editingId, setEditingId] = useState<string | null>(openEditId);
  const [showBatch, setShowBatch] = useState(false);

  useEffect(() => {
    if (openEditId) window.history.replaceState(null, "", "/dashboard/sales/customer-payments");
  }, [openEditId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return payments;
    return payments.filter((p) => {
      return (
        String(p.payment_no ?? "").toLowerCase().includes(q) ||
        String(p.customers?.name ?? "").toLowerCase().includes(q) ||
        String(p.payment_method ?? "").toLowerCase().includes(q) ||
        String(p.reference ?? "").toLowerCase().includes(q)
      );
    });
  }, [payments, search]);

  const selected = filtered.find((x) => x.id === selectedId) ?? null;
  const editing = payments.find((x) => x.id === editingId) ?? null;

  const hideList = Boolean(openEditId) && showSingle;

  async function handleDelete() {
    if (!selected) return;
    if (!confirm("Delete this payment?")) return;
    const res = await deleteCustomerPayment(selected.id);
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
              <h1 className="text-2xl font-semibold">Customer Payments</h1>
              <p className="text-sm text-muted-foreground">Record money received from customers.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowBatch(true)}>
                Batch Payment
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
              Customer payments table is missing. Run <code>supabase/ADD_CUSTOMER_PAYMENTS.sql</code> first.
            </p>
          )}
          {message && <p className="rounded border border-border bg-muted/30 px-3 py-1.5 text-sm">{message}</p>}

          <div className="rounded border border-border bg-card p-2">
            <label className="mb-1 block text-sm text-muted-foreground">Search</label>
            <input
              type="text"
              placeholder="Search by payment no, customer, method, reference..."
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
                    TRANS. DATE
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-left text-sm font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    CUSTOMER
                  </th>
                  <th className="border-b border-r border-border px-2 py-2 text-left text-sm font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    METHOD
                  </th>
                  <th className="border-b border-border px-2 py-2 text-right text-sm font-medium" style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    AMOUNT
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No customer payments found.
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
                      <td className="border-r border-border px-2 py-1.5 text-sm">{row.customers?.name ?? "—"}</td>
                      <td className="border-r border-border px-2 py-1.5 text-sm">{row.payment_method ?? "Cash"}</td>
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
          if (!next) setEditingId(null);
        }}
        customers={customers}
        paymentMethods={paymentMethods}
        paymentAccounts={paymentAccounts}
        initialPayment={editing}
        onSaved={() => window.location.reload()}
      />

      <BatchPaymentDialog
        open={showBatch}
        onOpenChange={setShowBatch}
        customers={customers}
        paymentMethods={paymentMethods}
        paymentAccounts={paymentAccounts}
        onSaved={() => window.location.reload()}
      />
    </div>
  );
}

function SinglePaymentDialog({
  open,
  onOpenChange,
  customers,
  paymentMethods,
  paymentAccounts,
  initialPayment,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  paymentMethods: PaymentMethod[];
  paymentAccounts: string[];
  initialPayment: Payment | null;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [paymentNo, setPaymentNo] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [outstanding, setOutstanding] = useState(0);
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [bankDate, setBankDate] = useState(todayIso());
  const [paymentAccount, setPaymentAccount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0]?.name || "Cash");
  const [amount, setAmount] = useState("0.00");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerRef = useRef<HTMLDivElement | null>(null);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.toLowerCase().trim();
    if (!q) return customers.slice(0, 20);
    return customers
      .filter((c) => customerLabel(c).toLowerCase().includes(q))
      .slice(0, 20);
  }, [customers, customerQuery]);

  async function refreshOutstanding(nextCustomerId: string, nextDate: string, excludeId?: string) {
    if (!nextCustomerId || !nextDate) {
      setOutstanding(0);
      return;
    }
    const res = await getCustomerOutstanding(nextCustomerId, nextDate, excludeId);
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
    // Use plain number for input (fmtMoney adds commas which break type="number")
    setAmount((Number(initialPayment?.amount ?? 0) || 0).toFixed(2));
    setReference(String(initialPayment?.reference ?? ""));
    setNotes(String(initialPayment?.notes ?? ""));
    setPaymentNo(String(initialPayment?.payment_no ?? ""));

    const cid = String(initialPayment?.customer_id ?? "");
    setCustomerId(cid);
    const c = customers.find((x) => x.id === cid);
    // Fallback to embedded customer data when not in active customers list (e.g. inactive)
    const custLabel = c
      ? customerLabel(c)
      : initialPayment?.customers?.name
        ? [initialPayment.customers.tax_id, initialPayment.customers.name].filter(Boolean).join(" - ") || String(initialPayment.customers.name)
        : "";
    setCustomerQuery(custLabel);
    void refreshOutstanding(cid, initDate, initialPayment?.id);
  }, [open, initialPayment, customers, paymentMethods]);

  useEffect(() => {
    if (!open || initialPayment?.id) return;
    let alive = true;
    void (async () => {
      const res = await getSuggestedPaymentNo(paymentDate);
      if (!alive || "error" in res) return;
      setPaymentNo(res.payment_no);
    })();
    return () => {
      alive = false;
    };
  }, [open, initialPayment?.id, paymentDate]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (customerRef.current && !customerRef.current.contains(target)) setShowCustomerDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialPayment?.id ? "Customer Payment" : "Customer Payment"}
      showGearIcon={false}
      contentClassName="max-w-[920px] text-sm"
      bodyClassName="max-h-[80vh] overflow-auto p-4"
    >
      <div className="space-y-3 text-sm">
        {error && <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">{error}</p>}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Payment No.</label>
            <input value={paymentNo} readOnly className="h-8 w-full rounded border border-input bg-muted/30 px-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Transaction Date</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => {
                const v = e.target.value;
                setPaymentDate(v);
                void refreshOutstanding(customerId, v, initialPayment?.id);
              }}
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

          <div className="md:col-span-2" ref={customerRef}>
            <label className="mb-1 block text-sm text-muted-foreground">Customer</label>
            <input
              value={customerQuery}
              onChange={(e) => {
                setCustomerQuery(e.target.value);
                setShowCustomerDropdown(true);
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              placeholder="Type customer code or name"
              className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
            />
            {showCustomerDropdown && filteredCustomers.length > 0 && (
              <div className="mt-1 max-h-48 overflow-auto rounded border border-border bg-popover shadow-md">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="block w-full px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerQuery(customerLabel(c));
                      setShowCustomerDropdown(false);
                      void refreshOutstanding(c.id, paymentDate, initialPayment?.id);
                    }}
                  >
                    {customerLabel(c)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Outstanding Balance</label>
            <input
              value={fmtMoney(outstanding)}
              readOnly
              className="h-8 w-full rounded border border-input bg-muted/30 px-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Payment Account</label>
            <input
              list="payment-account-options"
              value={paymentAccount}
              onChange={(e) => setPaymentAccount(e.target.value)}
              placeholder="Select account"
              className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
            />
            <datalist id="payment-account-options">
              {paymentAccounts.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Method</label>
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
            <label className="mb-1 block text-sm text-muted-foreground">Amount</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Reference</label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
              className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
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

        <div className="flex items-center justify-between border-t border-border pt-3">
          <Button
            size="sm"
            style={{ backgroundColor: "var(--navbar)" }}
            className="text-white"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError(null);
              const res = await saveCustomerPayment({
                id: initialPayment?.id,
                customer_id: customerId,
                payment_date: paymentDate,
                bank_date: bankDate,
                payment_account: paymentAccount,
                payment_method: paymentMethod,
                amount: Number(amount || 0),
                reference,
                notes,
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

function BatchPaymentDialog({
  open,
  onOpenChange,
  customers,
  paymentMethods,
  paymentAccounts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  paymentMethods: PaymentMethod[];
  paymentAccounts: string[];
  onSaved: () => void;
}) {
  const defaultMethod = String(paymentMethods[0]?.name ?? "Cash");
  const [transactionDate, setTransactionDate] = useState(todayIso());
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTransactionDate(todayIso());
    setRows(Array.from({ length: 10 }, (_, i) => blankBatchRow(i, todayIso(), defaultMethod)));
  }, [open, defaultMethod]);

  const total = useMemo(() => {
    return rows.reduce((sum, row) => clamp2(sum + Number(row.amount ?? 0)), 0);
  }, [rows]);

  const methodOptions =
    paymentMethods.length === 0 ? ["Cash"] : paymentMethods.map((m) => String(m.name ?? m.code ?? "Cash"));

  async function updateRowCustomer(rowIdx: number, customerId: string, query: string) {
    setRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== rowIdx) return row;
        return { ...row, customer_id: customerId, customer_query: query };
      })
    );
    if (!customerId) return;
    const res = await getCustomerOutstanding(customerId, transactionDate);
    if ("error" in res) return;
    setRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== rowIdx) return row;
        return { ...row, prev_bal: Number(res.outstanding ?? 0) };
      })
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Batch Customer Payments"
      showGearIcon={false}
      contentClassName="max-w-[1320px] text-sm"
      bodyClassName="max-h-[85vh] overflow-auto p-3"
    >
      <div className="space-y-2">
        {error && <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive">{error}</p>}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm text-muted-foreground">Transaction Date</label>
            <input
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
            />
          </div>
        </div>

        <div className="overflow-auto rounded border border-border">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr>
                <th className="w-12 border-b border-r border-border px-1 py-1 font-medium">#</th>
                <th className="w-56 border-b border-r border-border px-1 py-1 text-left font-medium">Customer</th>
                <th className="w-24 border-b border-r border-border px-1 py-1 text-right font-medium">Prev Bal</th>
                <th className="w-24 border-b border-r border-border px-1 py-1 text-right font-medium">Amount</th>
                <th className="w-32 border-b border-r border-border px-1 py-1 text-left font-medium">Bank Date</th>
                <th className="w-36 border-b border-r border-border px-1 py-1 text-left font-medium">Payment Account</th>
                <th className="w-24 border-b border-r border-border px-1 py-1 text-left font-medium">Method</th>
                <th className="w-28 border-b border-r border-border px-1 py-1 text-left font-medium">Reference</th>
                <th className="border-b border-r border-border px-1 py-1 text-left font-medium">Notes</th>
                <th className="w-10 border-b border-border px-1 py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const customerOptions = customers
                  .filter((c) => customerLabel(c).toLowerCase().includes(row.customer_query.toLowerCase().trim()))
                  .slice(0, 8);

                return (
                  <tr key={row.key} className={idx % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                    <td className="border-b border-r border-border px-1 py-1 text-sm">{idx + 1}</td>
                    <td className="relative border-b border-r border-border px-1 py-1">
                      <input
                        value={row.customer_query}
                        onChange={(e) => {
                          const value = e.target.value;
                          setRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, customer_query: value, customer_id: "" } : r))
                          );
                        }}
                        placeholder="Type code or name"
                        className="h-8 w-full rounded border-0 bg-transparent px-1 text-sm focus:bg-background"
                      />
                      {row.customer_query && !row.customer_id && customerOptions.length > 0 && (
                        <div className="absolute left-0 top-[calc(100%-1px)] z-10 max-h-40 w-full overflow-auto rounded border border-border bg-popover shadow-md">
                          {customerOptions.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="block w-full px-2 py-1 text-left text-sm hover:bg-muted"
                              onClick={() => void updateRowCustomer(idx, c.id, customerLabel(c))}
                            >
                              {customerLabel(c)}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="border-b border-r border-border px-1 py-1 text-right text-sm">{fmtMoney(row.prev_bal)}</td>
                    <td className="border-b border-r border-border px-1 py-1">
                      <input
                        type="number"
                        step="0.01"
                        value={row.amount}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, amount: Number(e.target.value || 0) } : r))
                          )
                        }
                        className="h-8 w-full rounded border-0 bg-transparent px-1 text-right text-sm focus:bg-background"
                      />
                    </td>
                    <td className="border-b border-r border-border px-1 py-1">
                      <input
                        type="date"
                        value={row.bank_date || transactionDate}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, bank_date: e.target.value } : r))
                          )
                        }
                        className="h-8 w-full rounded border-0 bg-transparent px-1 text-sm focus:bg-background"
                      />
                    </td>
                    <td className="border-b border-r border-border px-1 py-1">
                      <input
                        list={`batch-account-options-${idx}`}
                        value={row.payment_account}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, payment_account: e.target.value } : r))
                          )
                        }
                        placeholder="Select"
                        className="h-8 w-full rounded border-0 bg-transparent px-1 text-sm focus:bg-background"
                      />
                      <datalist id={`batch-account-options-${idx}`}>
                        {paymentAccounts.map((a) => (
                          <option key={a} value={a} />
                        ))}
                      </datalist>
                    </td>
                    <td className="border-b border-r border-border px-1 py-1">
                      <select
                        value={row.payment_method}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, payment_method: e.target.value } : r))
                          )
                        }
                        className="h-8 w-full rounded border-0 bg-transparent px-1 text-sm focus:bg-background"
                      >
                        {methodOptions.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-r border-border px-1 py-1">
                      <input
                        value={row.reference}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, reference: e.target.value } : r))
                          )
                        }
                        placeholder="Optional"
                        className="h-8 w-full rounded border-0 bg-transparent px-1 text-sm focus:bg-background"
                      />
                    </td>
                    <td className="border-b border-r border-border px-1 py-1">
                      <input
                        value={row.notes}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, notes: e.target.value } : r))
                          )
                        }
                        placeholder="Optional"
                        className="h-8 w-full rounded border-0 bg-transparent px-1 text-sm focus:bg-background"
                      />
                    </td>
                    <td className="border-b border-border px-1 py-1 text-center">
                      <button
                        type="button"
                        className="text-destructive"
                        onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Delete row"
                      >
                        <Trash2 className="mx-auto h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold">
                <td className="border-t border-r border-border px-1 py-1 text-sm" />
                <td className="border-t border-r border-border px-1 py-1 text-right text-sm" colSpan={2}>
                  Total
                </td>
                <td className="border-t border-r border-border px-1 py-1 text-right text-sm">
                  {fmtMoney(total)}
                </td>
                <td className="border-t border-border px-1 py-1" colSpan={6} />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <Button
            size="sm"
            style={{ backgroundColor: "var(--navbar)" }}
            className="text-white"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError(null);
              const payload = rows.map((r) => ({
                customer_id: r.customer_id,
                payment_date: transactionDate,
                bank_date: r.bank_date || transactionDate,
                payment_account: r.payment_account,
                payment_method: r.payment_method || defaultMethod,
                amount: Number(r.amount || 0),
                reference: r.reference,
                notes: r.notes,
              }));
              const res = await saveBatchCustomerPayments(payload);
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
