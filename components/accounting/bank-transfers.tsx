"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  deleteBankTransfer,
  getSuggestedTransferNo,
  saveBankTransfer,
  type SaveBankTransferInput,
} from "@/app/dashboard/accounting/bank-transfers/actions";

type PaymentAccount = {
  id: string;
  code?: string | null;
  name: string;
  account_type?: string | null;
};

type BankTransfer = {
  id: string;
  transfer_no: string;
  transfer_date: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  reference?: string | null;
  notes?: string | null;
  from_accounts?: { id: string; code?: string | null; name: string } | null;
  to_accounts?: { id: string; code?: string | null; name: string } | null;
};

function fmtMoney(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function accountLabel(a: PaymentAccount) {
  const code = String(a.code ?? "").trim();
  const name = String(a.name ?? "").trim();
  return code ? `${code} - ${name}` : name;
}

type BankTransfersProps = {
  transfers: BankTransfer[];
  accounts: PaymentAccount[];
  tableMissing?: boolean;
};

export function BankTransfers({
  transfers = [],
  accounts = [],
  tableMissing = false,
}: BankTransfersProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return transfers;
    return transfers.filter(
      (t) =>
        String(t.transfer_no ?? "").toLowerCase().includes(q) ||
        String(t.from_accounts?.name ?? "").toLowerCase().includes(q) ||
        String(t.to_accounts?.name ?? "").toLowerCase().includes(q) ||
        String(t.reference ?? "").toLowerCase().includes(q)
    );
  }, [transfers, search]);

  const selected = filtered.find((x) => x.id === selectedId) ?? null;
  const editing = transfers.find((x) => x.id === editingId) ?? null;

  async function handleDelete() {
    if (!selected) return;
    if (!confirm("Delete this transfer?")) return;
    const res = await deleteBankTransfer(selected.id);
    if ("error" in res) {
      setMessage(res.error ?? "Unknown error");
      return;
    }
    setMessage("Transfer deleted.");
    window.location.reload();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bank Transfers</h1>
          <p className="text-sm text-muted-foreground">Transfer money between bank and cash accounts.</p>
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
          New Transfer
        </Button>
      </div>

      {tableMissing && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Bank transfers table is missing. Run <code>supabase/migrations/022_bank_transfers.sql</code> first.
        </p>
      )}
      {message && <p className="rounded border border-border bg-muted/30 px-3 py-1.5 text-sm">{message}</p>}

      <div className="rounded border border-border bg-card p-2">
        <label className="mb-1 block text-sm text-muted-foreground">Search</label>
        <input
          type="text"
          placeholder="Search by transfer no, account name, reference..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
        />
      </div>

      <div className="max-h-[calc(100vh-18rem)] overflow-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead
            className="sticky top-0 z-10"
            style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 12%, white)" }}
          >
            <tr>
              <th className="w-12 border-b border-r border-border px-2 py-2 text-left font-medium">#</th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium">TRANSFER NO.</th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium">DATE</th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium">FROM</th>
              <th className="w-8 border-b border-r border-border px-2 py-2 text-center font-medium" />
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium">TO</th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium">REFERENCE</th>
              <th className="border-b border-border px-2 py-2 text-right font-medium">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  No bank transfers found.
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
                  <td className="border-r border-border px-2 py-1.5">{idx + 1}</td>
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
                  <td className="border-r border-border px-2 py-1.5">{row.transfer_date}</td>
                  <td className="border-r border-border px-2 py-1.5">{accountLabel(row.from_accounts ?? { id: row.from_account_id, name: "—" })}</td>
                  <td className="border-r border-border px-2 py-1.5 text-center text-muted-foreground">
                    <ArrowRightLeft className="mx-auto h-4 w-4" />
                  </td>
                  <td className="border-r border-border px-2 py-1.5">{accountLabel(row.to_accounts ?? { id: row.to_account_id, name: "—" })}</td>
                  <td className="border-r border-border px-2 py-1.5">{row.reference?.trim() ? row.reference : "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">GH₵ {fmtMoney(row.amount)}</td>
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

      <TransferFormDialog
        open={showForm}
        onOpenChange={(next) => {
          setShowForm(next);
          if (!next) setEditingId(null);
        }}
        accounts={accounts}
        initialTransfer={editing}
        onSaved={() => window.location.reload()}
      />
    </div>
  );
}

function TransferFormDialog({
  open,
  onOpenChange,
  accounts,
  initialTransfer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: PaymentAccount[];
  initialTransfer: BankTransfer | null;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferNo, setTransferNo] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    const initDate = initialTransfer?.transfer_date ?? new Date().toISOString().slice(0, 10);
    setTransferDate(initDate);
    setFromAccountId(String(initialTransfer?.from_account_id ?? ""));
    setToAccountId(String(initialTransfer?.to_account_id ?? ""));
    setAmount(initialTransfer?.amount ? String(initialTransfer.amount) : "");
    setReference(String(initialTransfer?.reference ?? ""));
    setNotes(String(initialTransfer?.notes ?? ""));
    setTransferNo(String(initialTransfer?.transfer_no ?? ""));
  }, [open, initialTransfer]);

  useEffect(() => {
    if (!open || initialTransfer?.id) return;
    let alive = true;
    void (async () => {
      const res = await getSuggestedTransferNo(transferDate);
      if (!alive || "error" in res) return;
      setTransferNo(res.transfer_no);
    })();
    return () => { alive = false; };
  }, [open, initialTransfer?.id, transferDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const amt = Number(String(amount).replace(/,/g, ""));
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Amount must be greater than 0.");
      setPending(false);
      return;
    }
    const input: SaveBankTransferInput = {
      id: initialTransfer?.id,
      transfer_date: transferDate,
      from_account_id: fromAccountId,
      to_account_id: toAccountId,
      amount: amt,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    const res = await saveBankTransfer(input);
    setPending(false);
    if ("error" in res) {
      setError(res.error ?? "Failed to save.");
      return;
    }
    onSaved();
    onOpenChange(false);
  }

  const inputClass = "h-8 w-full rounded border border-input bg-background px-2.5 text-sm";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialTransfer ? "Edit Bank Transfer" : "New Bank Transfer"}
      showGearIcon={false}
      contentClassName="max-w-md text-sm"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <div>
          <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
            Transfer No
          </label>
          <input type="text" value={transferNo} readOnly className={`${inputClass} bg-muted/50`} />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
            Transfer Date *
          </label>
          <input
            type="date"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
            From Account *
          </label>
          <select
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">-- Select --</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountLabel(a)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
            To Account *
          </label>
          <select
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">-- Select --</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountLabel(a)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
            Amount (GH₵) *
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-muted-foreground">Reference</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Optional"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-muted-foreground">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            rows={2}
            className={`${inputClass} min-h-[3.5rem] resize-none`}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} style={{ backgroundColor: "var(--navbar)" }} className="text-white">
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
