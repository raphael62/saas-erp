"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { searchPosReceipts, refundPosReceipt } from "@/app/dashboard/pos/actions";

type ReceiptRow = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  customer_name: string;
  grand_total: number;
  location_name: string;
  sales_rep_name: string;
  refunded_at: string | null;
};

function fmtMoney(value: number) {
  return `GH₵ ${(Number.isFinite(value) ? value : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function ReceiptsSearch() {
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [query, setQuery] = useState("");
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);

  const doSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await searchPosReceipts(
        fromDate,
        toDate,
        query.trim() || undefined
      );
      if (res.error) setError(res.error);
      else setReceipts(res.receipts ?? []);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, query]);

  useEffect(() => {
    doSearch();
  }, [doSearch]);

  const handleRefund = useCallback(
    async (r: ReceiptRow) => {
      if (r.refunded_at) return;
      if (!confirm(`Refund receipt ${r.invoice_no}? This cannot be undone.`)) return;
      setRefundingId(r.id);
      try {
        const res = await refundPosReceipt(r.id);
        if (res.error) {
          setError(res.error);
        } else {
          setReceipts((prev) =>
            prev.map((x) =>
              x.id === r.id ? { ...x, refunded_at: new Date().toISOString() } : x
            )
          );
          setError(null);
        }
      } finally {
        setRefundingId(null);
      }
    },
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-0.5 block text-sm font-medium">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-sm font-medium">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-sm font-medium">Search (invoice no / customer)</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="POS-20250321-0001 or customer name"
            className="h-8 w-64 rounded border border-input bg-background px-2.5 text-sm"
          />
        </div>
        <Button
          onClick={doSearch}
          disabled={loading}
          style={{ backgroundColor: "var(--navbar)", color: "white" }}
          className="border-transparent"
        >
          {loading ? "Searching…" : "Search"}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 12%, white)" }}>
              <th className="border-b border-r border-border px-3 py-2 text-left font-medium">Invoice No</th>
              <th className="border-b border-r border-border px-3 py-2 text-left font-medium">Date</th>
              <th className="border-b border-r border-border px-3 py-2 text-left font-medium">Customer</th>
              <th className="border-b border-r border-border px-3 py-2 text-left font-medium">Shop Sales Rep</th>
              <th className="border-b border-r border-border px-3 py-2 text-left font-medium">Location</th>
              <th className="border-b border-r border-border px-3 py-2 text-right font-medium">Total</th>
              <th className="border-b border-border px-3 py-2 text-center font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 ? (
              <tr>
                <td colSpan={7} className="border-b border-border px-3 py-4 text-center text-muted-foreground">
                  {loading ? "Loading…" : "No receipts found"}
                </td>
              </tr>
            ) : (
              receipts.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="border-b border-r border-border px-3 py-2 font-medium">{r.invoice_no}</td>
                  <td className="border-b border-r border-border px-3 py-2">{r.invoice_date}</td>
                  <td className="border-b border-r border-border px-3 py-2">{r.customer_name}</td>
                  <td className="border-b border-r border-border px-3 py-2">{r.sales_rep_name}</td>
                  <td className="border-b border-r border-border px-3 py-2">{r.location_name}</td>
                  <td className="border-b border-r border-border px-3 py-2 text-right tabular-nums">{fmtMoney(r.grand_total)}</td>
                  <td className="border-b border-border px-3 py-2 text-center">
                    <span className="inline-flex items-center gap-2">
                      <Link
                        href={`/dashboard/pos/receipts/${r.id}`}
                        className="text-[var(--navbar)] hover:underline"
                      >
                        Print
                      </Link>
                      {r.refunded_at ? (
                        <span className="text-muted-foreground text-xs">Refunded</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRefund(r)}
                          disabled={refundingId === r.id}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          title="Refund"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Refund
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
