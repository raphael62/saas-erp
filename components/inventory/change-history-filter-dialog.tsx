"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export type ChangeHistoryFilterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFrom: string;
  initialTo: string;
  initialIncludeInactive: boolean;
  initialExcludeNoTxn: boolean;
  initialItemQ: string;
  initialCategoryQ: string;
};

function buildQuery(params: Record<string, string | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function ChangeHistoryFilterDialog({
  open,
  onOpenChange,
  initialFrom,
  initialTo,
  initialIncludeInactive,
  initialExcludeNoTxn,
  initialItemQ,
  initialCategoryQ,
}: ChangeHistoryFilterDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [reportType, setReportType] = useState<"summary" | "daily" | "monthly">("summary");
  const [displayDetail, setDisplayDetail] = useState<"display" | "details">("display");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [locationQ, setLocationQ] = useState("");
  const [itemQ, setItemQ] = useState(initialItemQ);
  const [categoryQ, setCategoryQ] = useState(initialCategoryQ);
  const [includeInactive, setIncludeInactive] = useState(initialIncludeInactive);
  const [excludeNoTxn, setExcludeNoTxn] = useState(initialExcludeNoTxn);

  useEffect(() => {
    if (!open) return;
    setFrom(initialFrom);
    setTo(initialTo);
    setIncludeInactive(initialIncludeInactive);
    setExcludeNoTxn(initialExcludeNoTxn);
    setItemQ(initialItemQ);
    setCategoryQ(initialCategoryQ);
  }, [
    open,
    initialFrom,
    initialTo,
    initialIncludeInactive,
    initialExcludeNoTxn,
    initialItemQ,
    initialCategoryQ,
  ]);

  const apply = useCallback(() => {
    const q = buildQuery({
      from,
      to,
      include_inactive: includeInactive ? "1" : undefined,
      exclude_no_txn: excludeNoTxn ? "1" : undefined,
      item_q: itemQ.trim() || undefined,
      category_q: categoryQ.trim() || undefined,
    });
    router.push(`${pathname}${q}`);
    onOpenChange(false);
  }, [from, to, includeInactive, excludeNoTxn, itemQ, categoryQ, router, pathname, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        apply();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, apply]);

  function reset() {
    const t = new Date();
    const start = new Date(t.getFullYear(), t.getMonth(), 1);
    setFrom(iso(start));
    setTo(iso(t));
    setIncludeInactive(false);
    setExcludeNoTxn(false);
    setItemQ("");
    setCategoryQ("");
    setLocationQ("");
    setReportType("summary");
    setDisplayDetail("display");
  }

  function setToday() {
    const t = iso(new Date());
    setFrom(t);
    setTo(t);
  }

  function setPrevDay() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const s = iso(d);
    setFrom(s);
    setTo(s);
  }

  function setThisWeek() {
    const t = new Date();
    const start = startOfWeekMonday(t);
    setFrom(iso(start));
    setTo(iso(t));
  }

  function setPrevWeek() {
    const t = new Date();
    t.setDate(t.getDate() - 7);
    const start = startOfWeekMonday(t);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    setFrom(iso(start));
    setTo(iso(end));
  }

  const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";
  const inputClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
  const radioRow = "flex flex-wrap gap-4 text-sm";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Inventory change history — search"
      subtitle="Set criteria and run search (F8)"
      showGearIcon={false}
      contentClassName="max-w-4xl"
      bodyClassName="max-h-[min(78vh,720px)] overflow-y-auto p-4 sm:p-6"
    >
      <div className="space-y-5 text-sm">
        <section className="space-y-2">
          <span className={labelClass}>Type</span>
          <div className={radioRow}>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="ch-type" checked={reportType === "summary"} onChange={() => setReportType("summary")} className="h-3.5 w-3.5" />
              Summary
            </label>
            <label className="flex cursor-not-allowed items-center gap-2 opacity-50">
              <input type="radio" name="ch-type" disabled className="h-3.5 w-3.5" />
              Daily
            </label>
            <label className="flex cursor-not-allowed items-center gap-2 opacity-50">
              <input type="radio" name="ch-type" disabled className="h-3.5 w-3.5" />
              Monthly
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Daily and monthly breakdowns are not available in this version.</p>
        </section>

        <section className="space-y-2">
          <span className={labelClass}>Increase / decrease display</span>
          <div className={radioRow}>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="ch-disp" checked={displayDetail === "display"} onChange={() => setDisplayDetail("display")} className="h-3.5 w-3.5" />
              Display
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="ch-disp" checked={displayDetail === "details"} onChange={() => setDisplayDetail("details")} className="h-3.5 w-3.5" />
              Display details
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Detail layout applies to future exports; the grid is always summary-style.</p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="ch-filter-from">
              Date from
            </label>
            <input id="ch-filter-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="ch-filter-to">
              Date to
            </label>
            <input id="ch-filter-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="ch-loc">
              Location
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="ch-loc"
                type="text"
                value={locationQ}
                onChange={(e) => setLocationQ(e.target.value)}
                placeholder="Filter by location (coming soon)"
                disabled
                className={`${inputClass} pl-9 opacity-60`}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="ch-item-server">
              Item (code / name contains)
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="ch-item-server"
                type="text"
                value={itemQ}
                onChange={(e) => setItemQ(e.target.value)}
                placeholder="Server filter on load"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <span className={labelClass}>Item category (reference)</span>
          <div className="flex flex-wrap gap-x-4 gap-y-2 opacity-70">
            {["All", "Raw material", "Sub material", "Finished goods", "Semi-finished", "Merchandise", "Intangible"].map(
              (label, i) => (
                <label key={label} className="flex items-center gap-2">
                  <input type="checkbox" disabled checked={i === 0} readOnly className="h-3.5 w-3.5 rounded" />
                  {label}
                </label>
              )
            )}
          </div>
          <p className="text-xs text-muted-foreground">Preset categories are for reference; use the text field below to filter.</p>
          <div>
            <label className={labelClass} htmlFor="ch-cat-q">
              Category text contains (matches product brand/category field)
            </label>
            <input
              id="ch-cat-q"
              type="text"
              value={categoryQ}
              onChange={(e) => setCategoryQ(e.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </div>
        </section>

        <section className="space-y-2 border-t border-border pt-4">
          <span className={labelClass}>Others</span>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} className="h-3.5 w-3.5 rounded" />
              Include deactivated items
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={excludeNoTxn} onChange={(e) => setExcludeNoTxn(e.target.checked)} className="h-3.5 w-3.5 rounded" />
              Exclude items without transactions
            </label>
            <label className="flex cursor-not-allowed items-center gap-2 opacity-50">
              <input type="checkbox" disabled className="h-3.5 w-3.5 rounded" />
              Include goods issued / location transfer
            </label>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button
            type="button"
            size="sm"
            className="text-white"
            style={{ backgroundColor: "var(--navbar)" }}
            onClick={apply}
          >
            Search (F8)
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={setToday}>
            Today
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={setPrevDay}>
            Prev. day
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={setThisWeek}>
            This week (~ today)
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={setPrevWeek}>
            Prev. week
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            Reset
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
