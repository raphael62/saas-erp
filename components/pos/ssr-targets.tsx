"use client";

import { useRef, useState } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  deleteSSRMonthlyTarget,
  importSSRMonthlyTargetsCsv,
  saveSSRMonthlyTarget,
} from "@/app/dashboard/sales/targets/actions";
import { useRouter } from "next/navigation";

type Rep = { id: string; code?: string | null; name: string; sales_rep_type?: string | null; is_active?: boolean | null };
type SSRTarget = {
  id: string;
  sales_rep_id: string;
  month_start: string;
  target_value?: number | null;
  commission_pct?: number | null;
  notes?: string | null;
  sales_reps?: { id: string; code?: string | null; name: string } | null;
};

function n(v: string | number | null | undefined) {
  const x = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
}

function monthInputValue(isoDate: string) {
  return String(isoDate ?? "").slice(0, 7);
}

function repLabel(r: Rep) {
  const c = String(r.code ?? "").trim();
  return c ? `${c} — ${r.name}` : r.name;
}

function looksSSR(rep: Rep) {
  const t = String(rep.sales_rep_type ?? "").toLowerCase();
  return t.includes("shop") || t.includes("ssr");
}

export function SsrTargets({
  ssrTargets,
  reps,
}: {
  ssrTargets: SSRTarget[];
  reps: Rep[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SSRTarget | null>(null);
  const [repId, setRepId] = useState("");
  const [repQuery, setRepQuery] = useState("");
  const [showRepDropdown, setShowRepDropdown] = useState(false);
  const [month, setMonth] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [commission, setCommission] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const ssrReps = reps.filter((r) => r.is_active !== false && looksSSR(r));
  const repOptions = ssrReps.length ? ssrReps : reps.filter((r) => r.is_active !== false);

  function openNew() {
    setEditing(null);
    setRepId("");
    setRepQuery("");
    setMonth(new Date().toISOString().slice(0, 7));
    setTargetValue("0");
    setCommission("0");
    setNotes("");
    setMsg(null);
    setOpen(true);
  }

  function openEdit(t: SSRTarget) {
    setEditing(t);
    setRepId(String(t.sales_rep_id));
    setRepQuery(t.sales_reps ? repLabel(t.sales_reps as Rep) : "");
    setMonth(monthInputValue(t.month_start));
    setTargetValue(String(t.target_value ?? 0));
    setCommission(String(t.commission_pct ?? 0));
    setNotes(String(t.notes ?? ""));
    setMsg(null);
    setOpen(true);
  }

  async function onSave() {
    setSaving(true);
    setMsg(null);
    const fd = new FormData();
    if (editing) fd.set("id", editing.id);
    fd.set("sales_rep_id", repId);
    fd.set("month_start", month);
    fd.set("target_value", String(n(targetValue)));
    fd.set("commission_pct", String(n(commission)));
    fd.set("notes", notes);
    const res = await saveSSRMonthlyTarget(fd);
    setSaving(false);
    if ("error" in res && res.error) return setMsg(res.error);
    setOpen(false);
    router.refresh();
  }

  async function onImport(file: File) {
    setImporting(true);
    setImportMsg(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await importSSRMonthlyTargetsCsv(fd);
    setImporting(false);
    if ("error" in res && res.error) return setImportMsg(res.error);
    setImportMsg(`Imported ${res.count ?? 0} SSR target rows.`);
    router.refresh();
  }

  function findRepByQuery(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return (
      repOptions.find((r) => repLabel(r).toLowerCase() === q) ??
      repOptions.find((r) => String(r.code ?? "").trim().toLowerCase() === q) ??
      repOptions.find((r) => r.name.toLowerCase() === q) ??
      null
    );
  }

  function filterReps(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) return repOptions;
    return repOptions.filter((r) => repLabel(r).toLowerCase().includes(q));
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">SSR Monthly Targets</h2>
        <p className="text-muted-foreground text-sm">Set monthly SSR target value and commission percentage.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" asChild>
          <a href="/import-templates/ssr-targets-template.csv" download>
            <Download className="h-4 w-4" />
            Template
          </a>
        </Button>
        <Button size="sm" variant="outline" disabled={importing} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" />
          {importing ? "Importing..." : "Import CSV"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            await onImport(f);
            e.currentTarget.value = "";
          }}
        />
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          New SSR Target
        </Button>
      </div>
      {importMsg && <p className="text-muted-foreground text-xs">{importMsg}</p>}

      <div className="overflow-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b text-left text-xs uppercase">
              <th className="px-3 py-2">Month</th>
              <th className="px-3 py-2">Sales rep</th>
              <th className="px-3 py-2 text-right">Target value</th>
              <th className="px-3 py-2 text-right">Commission %</th>
              <th className="px-3 py-2 text-right">Est. commission</th>
              <th className="px-3 py-2 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ssrTargets.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-3 py-6 text-center">
                  No SSR targets yet.
                </td>
              </tr>
            ) : (
              ssrTargets.map((t) => {
                const tv = n(t.target_value);
                const pct = n(t.commission_pct);
                return (
                  <tr key={t.id} className="border-b border-border">
                    <td className="px-3 py-2">{monthInputValue(t.month_start)}</td>
                    <td className="px-3 py-2">{t.sales_reps?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{tv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{(tv * pct / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(t)}>Edit</Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive h-8 w-8"
                          onClick={async () => {
                            if (!confirm("Delete this SSR target?")) return;
                            const res = await deleteSSRMonthlyTarget(t.id);
                            if ("error" in res && res.error) alert(res.error);
                            else router.refresh();
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen} title={editing ? "Edit SSR Target" : "New SSR Target"} contentClassName="max-w-md">
        <div className="space-y-3">
          {msg && <p className="bg-destructive/10 text-destructive rounded px-2 py-1.5 text-sm">{msg}</p>}
          <div>
            <label className="mb-1 block text-xs font-medium">Sales rep</label>
            <div className="relative">
              <input
                value={repQuery}
                onChange={(e) => {
                  const q = e.target.value;
                  setRepQuery(q);
                  const found = findRepByQuery(q);
                  setRepId(found ? found.id : "");
                  setShowRepDropdown(true);
                }}
                onFocus={() => setShowRepDropdown(true)}
                onBlur={() => {
                  const found = findRepByQuery(repQuery);
                  setRepId(found ? found.id : "");
                  setTimeout(() => setShowRepDropdown(false), 120);
                }}
                placeholder="Type to filter reps..."
                className="border-input bg-background h-9 w-full rounded border px-2 text-sm"
              />
              {showRepDropdown && filterReps(repQuery).length > 0 && (
                <div className="absolute left-0 top-full z-[80] mt-0.5 max-h-48 min-w-[20rem] overflow-auto rounded border border-border bg-background shadow-xl">
                  {filterReps(repQuery).slice(0, 25).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="w-full whitespace-nowrap px-2.5 py-2 text-left text-sm font-medium hover:bg-muted/80"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setRepId(r.id);
                        setRepQuery(repLabel(r));
                        setShowRepDropdown(false);
                      }}
                    >
                      {repLabel(r)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="border-input bg-background h-9 w-full rounded border px-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Target value</label>
              <input value={targetValue} onChange={(e) => setTargetValue(e.target.value)} className="border-input bg-background h-9 w-full rounded border px-2 text-right text-sm tabular-nums" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Commission %</label>
              <input value={commission} onChange={(e) => setCommission(e.target.value)} className="border-input bg-background h-9 w-full rounded border px-2 text-right text-sm tabular-nums" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="border-input bg-background w-full rounded border px-2 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void onSave()}>Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
