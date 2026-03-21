"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  deleteSSRMonthlyTarget,
  deleteVSRMonthlyTarget,
  importSSRMonthlyTargetsCsv,
  importVSRMonthlyTargetsCsv,
  saveSSRMonthlyTarget,
  saveVSRMonthlyTarget,
} from "@/app/dashboard/sales/targets/actions";
import { useRouter } from "next/navigation";

type Rep = { id: string; code?: string | null; name: string; sales_rep_type?: string | null; is_active?: boolean | null };
type Product = { id: string; code?: string | null; name: string };
type Customer = { id: string; tax_id?: string | null; name: string; price_type?: string | null };

type PriceList = {
  id: string;
  effective_date?: string | null;
  expiry_date?: string | null;
  is_active?: boolean | null;
  price_types?: { name?: string | null } | null;
};
type PriceListItem = { price_list_id: string; product_id: string | number; price?: number | null };

type SSRTarget = {
  id: string;
  sales_rep_id: string;
  month_start: string;
  target_value?: number | null;
  commission_pct?: number | null;
  notes?: string | null;
  sales_reps?: { id: string; code?: string | null; name: string } | null;
};

type VSRTarget = {
  id: string;
  sales_rep_id: string;
  month_start: string;
  commission_pct?: number | null;
  notes?: string | null;
  customer_id?: string | null;
  sales_reps?: { id: string; code?: string | null; name: string } | null;
  customers?: { id?: string; name?: string | null } | null;
};

type VSRLine = {
  id: string;
  vsr_monthly_target_id: string;
  product_id: string;
  target_qty?: number | null;
  target_value?: number | null;
  unit_price?: number | null;
  row_no?: number | null;
  products?: { id: string; code?: string | null; name: string } | null;
};

type EditVsrLine = {
  key: string;
  product_id: string;
  product_label: string;
  target_qty: string;
  price: string;
  target_value: string;
};

function monthInputValue(isoDate: string) {
  return String(isoDate ?? "").slice(0, 7);
}

function n(v: string | number | null | undefined) {
  const x = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
}

function repLabel(r: Rep) {
  const c = String(r.code ?? "").trim();
  return c ? `${c} — ${r.name}` : r.name;
}

function productLabel(p: Product) {
  const c = String(p.code ?? "").trim();
  return c ? `${c} — ${p.name}` : p.name;
}

function customerLabel(c: Customer) {
  const code = String(c.tax_id ?? "").trim();
  return code ? `${code} — ${c.name}` : c.name;
}

function blankLine(key: string): EditVsrLine {
  return { key, product_id: "", product_label: "", target_qty: "", price: "", target_value: "" };
}

function looksSSR(rep: Rep) {
  const t = String(rep.sales_rep_type ?? "").toLowerCase();
  return t.includes("shop") || t.includes("ssr");
}

function looksVSR(rep: Rep) {
  const t = String(rep.sales_rep_type ?? "").toLowerCase();
  return t.includes("van") || t.includes("vsr");
}

export function SalesTargets({
  ssrTargets,
  vsrTargets,
  vsrLines,
  reps,
  products,
  customers = [],
  priceLists = [],
  priceListItems = [],
  currentRetailPrices = {},
  showSSR = true,
}: {
  ssrTargets: SSRTarget[];
  vsrTargets: VSRTarget[];
  vsrLines: VSRLine[];
  reps: Rep[];
  products: Product[];
  customers?: Customer[];
  priceLists?: PriceList[];
  priceListItems?: PriceListItem[];
  currentRetailPrices?: Record<string, number>;
  showSSR?: boolean;
}) {
  const router = useRouter();
  const activeReps = useMemo(() => reps.filter((r) => r.is_active !== false), [reps]);
  const ssrReps = useMemo(() => {
    const typed = activeReps.filter(looksSSR);
    return typed.length ? typed : activeReps;
  }, [activeReps]);
  const vsrReps = useMemo(() => {
    const typed = activeReps.filter(looksVSR);
    return typed.length ? typed : activeReps;
  }, [activeReps]);

  const linesByTarget = useMemo(() => {
    const m = new Map<string, VSRLine[]>();
    for (const l of vsrLines) {
      const id = String(l.vsr_monthly_target_id);
      const arr = m.get(id) ?? [];
      arr.push(l);
      m.set(id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => Number(a.row_no ?? 0) - Number(b.row_no ?? 0));
    return m;
  }, [vsrLines]);

  const [ssrOpen, setSsrOpen] = useState(false);
  const [ssrEditing, setSsrEditing] = useState<SSRTarget | null>(null);
  const [ssrRepId, setSsrRepId] = useState("");
  const [ssrMonth, setSsrMonth] = useState("");
  const [ssrTargetValue, setSsrTargetValue] = useState("");
  const [ssrCommission, setSsrCommission] = useState("");
  const [ssrNotes, setSsrNotes] = useState("");

  const [vsrOpen, setVsrOpen] = useState(false);
  const [vsrEditing, setVsrEditing] = useState<VSRTarget | null>(null);
  const [vsrRepId, setVsrRepId] = useState("");
  const [vsrRepQuery, setVsrRepQuery] = useState("");
  const [showVsrRepDropdown, setShowVsrRepDropdown] = useState(false);
  const [vsrCustomerId, setVsrCustomerId] = useState("");
  const [vsrCustomerQuery, setVsrCustomerQuery] = useState("");
  const [showVsrCustomerDropdown, setShowVsrCustomerDropdown] = useState(false);
  const [lineProductDropdownRow, setLineProductDropdownRow] = useState<number | null>(null);
  const [vsrMonth, setVsrMonth] = useState("");
  const [vsrCommission, setVsrCommission] = useState("");
  const [vsrNotes, setVsrNotes] = useState("");
  const [vsrEditLines, setVsrEditLines] = useState<EditVsrLine[]>([blankLine("0"), blankLine("1")]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ssrImporting, setSsrImporting] = useState(false);
  const [vsrImporting, setVsrImporting] = useState(false);
  const [ssrImportMsg, setSsrImportMsg] = useState<string | null>(null);
  const [vsrImportMsg, setVsrImportMsg] = useState<string | null>(null);
  const ssrFileRef = useRef<HTMLInputElement | null>(null);
  const vsrFileRef = useRef<HTMLInputElement | null>(null);

  function openNewSSR() {
    setSsrEditing(null);
    setSsrRepId("");
    setSsrMonth(new Date().toISOString().slice(0, 7));
    setSsrTargetValue("0");
    setSsrCommission("0");
    setSsrNotes("");
    setMsg(null);
    setSsrOpen(true);
  }

  function openEditSSR(t: SSRTarget) {
    setSsrEditing(t);
    setSsrRepId(String(t.sales_rep_id));
    setSsrMonth(monthInputValue(t.month_start));
    setSsrTargetValue(String(t.target_value ?? 0));
    setSsrCommission(String(t.commission_pct ?? 0));
    setSsrNotes(String(t.notes ?? ""));
    setMsg(null);
    setSsrOpen(true);
  }

  function ensureTrailingBlank(rows: EditVsrLine[]) {
    const list = [...rows];
    if (list.length === 0) list.push(blankLine("0"));
    const last = list[list.length - 1];
    if (last.product_id || n(last.target_qty) !== 0 || n(last.target_value) !== 0 || n(last.price) !== 0) {
      list.push(blankLine(String(list.length)));
    }
    return list.map((x, i) => ({ ...x, key: String(i) }));
  }

  function openNewVSR() {
    setVsrEditing(null);
    setVsrRepId("");
    setVsrRepQuery("");
    setVsrCustomerId("");
    setVsrCustomerQuery("");
    setVsrMonth(new Date().toISOString().slice(0, 7));
    setVsrCommission("0");
    setVsrNotes("");
    setVsrEditLines([blankLine("0"), blankLine("1")]);
    setMsg(null);
    setVsrOpen(true);
  }

  function openEditVSR(t: VSRTarget) {
    setVsrEditing(t);
    setVsrRepId(String(t.sales_rep_id));
    setVsrRepQuery(t.sales_reps ? repLabel(t.sales_reps as Rep) : "");
    const cust = customers.find((c) => String(c.id) === String(t.customer_id ?? ""));
    setVsrCustomerId(String(t.customer_id ?? ""));
    setVsrCustomerQuery(cust ? customerLabel(cust) : "");
    setVsrMonth(monthInputValue(t.month_start));
    setVsrCommission(String(t.commission_pct ?? 0));
    setVsrNotes(String(t.notes ?? ""));
    const source = linesByTarget.get(t.id) ?? [];
    const rows =
      source.length > 0
        ? source.map((l, i) => {
            const qty = n(l.target_qty);
            const val = n(l.target_value);
            const unitPrice = n(l.unit_price);
            const priceStr =
              unitPrice > 0 ? String(unitPrice) : qty > 0 && val > 0 ? String(Number((val / qty).toFixed(4))) : "";
            return {
              key: String(i),
              product_id: String(l.product_id),
              product_label: `${l.products?.code ? `${l.products.code} — ` : ""}${l.products?.name ?? ""}`,
              target_qty: String(l.target_qty ?? ""),
              price: priceStr,
              target_value: String(l.target_value ?? ""),
            };
          })
        : [blankLine("0"), blankLine("1")];
    setVsrEditLines(ensureTrailingBlank(rows));
    setMsg(null);
    setVsrOpen(true);
  }

  useEffect(() => {
    if (!vsrOpen || vsrEditLines.length === 0) return;
    const pt = customerPriceType;
    const dt = vsrPriceDate;
    if (!pt || !dt) return;
    let changed = false;
    const next = vsrEditLines.map((line) => {
      if (!line.product_id) return line;
      const lookupPrice = getEffectivePrice(line.product_id, pt, dt);
      if (lookupPrice <= 0) return line;
      const currentPrice = n(line.price);
      if (Math.abs(currentPrice - lookupPrice) < 0.0001) return line;
      changed = true;
      const qty = String(line.target_qty ?? "");
      return {
        ...line,
        price: String(lookupPrice),
        target_value: calcTargetValueFromPrice(String(lookupPrice), qty),
      };
    });
    if (changed) setVsrEditLines(next);
  }, [vsrOpen, vsrCustomerId, vsrMonth]);

  async function onSaveSSR() {
    setSaving(true);
    setMsg(null);
    const fd = new FormData();
    if (ssrEditing) fd.set("id", ssrEditing.id);
    fd.set("sales_rep_id", ssrRepId);
    fd.set("month_start", ssrMonth);
    fd.set("target_value", String(n(ssrTargetValue)));
    fd.set("commission_pct", String(n(ssrCommission)));
    fd.set("notes", ssrNotes);
    const res = await saveSSRMonthlyTarget(fd);
    setSaving(false);
    if ("error" in res && res.error) return setMsg(res.error);
    setSsrOpen(false);
    router.refresh();
  }

  async function onSaveVSR() {
    setSaving(true);
    setMsg(null);
    const fd = new FormData();
    if (vsrEditing) fd.set("id", vsrEditing.id);
    fd.set("sales_rep_id", vsrRepId);
    fd.set("month_start", vsrMonth);
    fd.set("commission_pct", String(n(vsrCommission)));
    fd.set("customer_id", vsrCustomerId);
    fd.set("notes", vsrNotes);
    vsrEditLines.forEach((l, i) => {
      if (!l.product_id) return;
      fd.set(`line_product_id_${i}`, l.product_id);
      fd.set(`line_target_qty_${i}`, String(n(l.target_qty)));
      fd.set(`line_price_${i}`, String(n(l.price)));
      fd.set(`line_target_value_${i}`, String(n(l.target_value)));
    });
    const res = await saveVSRMonthlyTarget(fd);
    setSaving(false);
    if ("error" in res && res.error) return setMsg(res.error);
    setVsrOpen(false);
    router.refresh();
  }

  function findRepByQuery(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return (
      vsrReps.find((r) => repLabel(r).toLowerCase() === q) ??
      vsrReps.find((r) => String(r.code ?? "").trim().toLowerCase() === q) ??
      vsrReps.find((r) => r.name.toLowerCase() === q) ??
      null
    );
  }

  function findProductByQuery(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return (
      products.find((p) => productLabel(p).toLowerCase() === q) ??
      products.find((p) => String(p.code ?? "").trim().toLowerCase() === q) ??
      products.find((p) => p.name.toLowerCase() === q) ??
      null
    );
  }

  function filterReps(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) return vsrReps;
    return vsrReps.filter((r) => repLabel(r).toLowerCase().includes(q));
  }

  function filterProducts(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => productLabel(p).toLowerCase().includes(q));
  }

  function filterCustomers(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => customerLabel(c).toLowerCase().includes(q));
  }

  const normalizedPriceLists = useMemo(() => {
    return (priceLists ?? [])
      .filter((pl) => pl.is_active !== false)
      .map((pl) => ({
        ...pl,
        priceTypeName: String(pl.price_types?.name ?? "")
          .trim()
          .toLowerCase(),
      }));
  }, [priceLists]);

  const priceItemByListAndProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of priceListItems ?? []) {
      const key = `${String(item.price_list_id)}|${String(item.product_id)}`;
      const p = Number(item.price ?? 0);
      map.set(key, Number.isFinite(p) ? p : 0);
    }
    return map;
  }, [priceListItems]);

  function getEffectivePrice(productId: string, priceTypeName: string, onDate: string): number {
    const key = priceTypeName.trim().toLowerCase();
    if (!productId || !key || !onDate) return 0;
    const dateOrMin = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : "0000-01-01");
    const candidates = normalizedPriceLists
      .filter((pl) => {
        if ((pl as { priceTypeName?: string }).priceTypeName !== key) return false;
        const eff = dateOrMin(pl.effective_date);
        const exp = pl.expiry_date ? String(pl.expiry_date).slice(0, 10) : "";
        if (eff > onDate) return false;
        if (exp && exp < onDate) return false;
        return true;
      })
      .sort((a, b) => dateOrMin(b.effective_date).localeCompare(dateOrMin(a.effective_date)));

    for (const pl of candidates) {
      const v = priceItemByListAndProduct.get(`${pl.id}|${productId}`);
      if (v != null && v > 0) return v;
    }
    return 0;
  }

  const customerPriceType = useMemo(() => {
    if (!vsrCustomerId) return "retail";
    const c = customers.find((x) => String(x.id) === vsrCustomerId);
    return String(c?.price_type ?? "retail").trim() || "retail";
  }, [vsrCustomerId, customers]);

  const vsrPriceDate = useMemo(() => {
    const ms = vsrMonth ? `${String(vsrMonth).slice(0, 7)}-01` : new Date().toISOString().slice(0, 10);
    return ms;
  }, [vsrMonth]);

  function calcTargetValueFromPrice(priceRaw: string, qtyRaw: string) {
    const p = n(priceRaw);
    const q = n(qtyRaw);
    return String(Number((p * q).toFixed(2)));
  }

  async function onImportSSR(file: File) {
    setSsrImporting(true);
    setSsrImportMsg(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await importSSRMonthlyTargetsCsv(fd);
    setSsrImporting(false);
    if ("error" in res && res.error) return setSsrImportMsg(res.error);
    setSsrImportMsg(`Imported ${res.count ?? 0} SSR target rows.`);
    router.refresh();
  }

  async function onImportVSR(file: File) {
    setVsrImporting(true);
    setVsrImportMsg(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await importVSRMonthlyTargetsCsv(fd);
    setVsrImporting(false);
    if ("error" in res && res.error) return setVsrImportMsg(res.error);
    setVsrImportMsg(`Imported ${res.count ?? 0} VSR monthly targets.`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Sales Targets</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {showSSR ? "Configure monthly SSR and VSR targets." : "Configure monthly VSR targets by product."}
        </p>
      </div>

      {showSSR && (
      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">SSR Monthly Targets</h2>
            <p className="text-muted-foreground text-xs">Monthly target value with commission percentage per shop sales rep.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href="/import-templates/ssr-targets-template.csv" download>
                <Download className="h-4 w-4" />
                Template
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={ssrImporting}
              onClick={() => ssrFileRef.current?.click()}
              className="gap-1"
            >
              <Upload className="h-4 w-4" />
              {ssrImporting ? "Importing..." : "Import CSV"}
            </Button>
            <input
              ref={ssrFileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                await onImportSSR(file);
                e.currentTarget.value = "";
              }}
            />
            <Button onClick={openNewSSR} className="gap-1">
              <Plus className="h-4 w-4" />
              New SSR Target
            </Button>
          </div>
        </div>
        {ssrImportMsg && <p className="text-muted-foreground text-xs">{ssrImportMsg}</p>}
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
                          <Button size="sm" variant="outline" onClick={() => openEditSSR(t)}>Edit</Button>
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
      </div>
      )}

      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">VSR Monthly Targets</h2>
            <p className="text-muted-foreground text-xs">Monthly targets by product quantity and value for van sales reps.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href="/import-templates/vsr-targets-template.csv" download>
                <Download className="h-4 w-4" />
                Template
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={vsrImporting}
              onClick={() => vsrFileRef.current?.click()}
              className="gap-1"
            >
              <Upload className="h-4 w-4" />
              {vsrImporting ? "Importing..." : "Import CSV"}
            </Button>
            <input
              ref={vsrFileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                await onImportVSR(file);
                e.currentTarget.value = "";
              }}
            />
            <Button onClick={openNewVSR} className="gap-1">
              <Plus className="h-4 w-4" />
              New VSR Target
            </Button>
          </div>
        </div>
        {vsrImportMsg && <p className="text-muted-foreground text-xs">{vsrImportMsg}</p>}
        <div className="overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b text-left text-xs uppercase">
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2">Sales rep</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2 text-right">Commission %</th>
                <th className="px-3 py-2 text-right">Products</th>
                <th className="px-3 py-2 text-right">Total qty</th>
                <th className="px-3 py-2 text-right">Total value</th>
                <th className="px-3 py-2 w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vsrTargets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-muted-foreground px-3 py-6 text-center">
                    No VSR targets yet.
                  </td>
                </tr>
              ) : (
                vsrTargets.map((t) => {
                  const ls = linesByTarget.get(t.id) ?? [];
                  return (
                    <tr key={t.id} className="border-b border-border">
                      <td className="px-3 py-2">{monthInputValue(t.month_start)}</td>
                      <td className="px-3 py-2">{t.sales_reps?.name ?? "—"}</td>
                      <td className="px-3 py-2">{t.customers?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {n(t.commission_pct).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{ls.length}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{ls.reduce((s, l) => s + n(l.target_qty), 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{ls.reduce((s, l) => s + n(l.target_value), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openEditVSR(t)}>Edit</Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive h-8 w-8"
                            onClick={async () => {
                              if (!confirm("Delete this VSR target?")) return;
                              const res = await deleteVSRMonthlyTarget(t.id);
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
      </div>

      <Dialog
        open={ssrOpen}
        onOpenChange={setSsrOpen}
        title={ssrEditing ? "Edit SSR Target" : "New SSR Target"}
        contentClassName="max-w-md"
      >
        <div className="space-y-3">
          {msg && <p className="bg-destructive/10 text-destructive rounded px-2 py-1.5 text-sm">{msg}</p>}
          <div>
            <label className="mb-1 block text-xs font-medium">Sales rep</label>
            <select value={ssrRepId} onChange={(e) => setSsrRepId(e.target.value)} className="border-input bg-background h-9 w-full rounded border px-2 text-sm">
              <option value="">Select sales rep</option>
              {ssrReps.map((r) => (
                <option key={r.id} value={r.id}>{repLabel(r)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Month</label>
            <input type="month" value={ssrMonth} onChange={(e) => setSsrMonth(e.target.value)} className="border-input bg-background h-9 w-full rounded border px-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Target value</label>
              <input value={ssrTargetValue} onChange={(e) => setSsrTargetValue(e.target.value)} className="border-input bg-background h-9 w-full rounded border px-2 text-sm text-right tabular-nums" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Commission %</label>
              <input value={ssrCommission} onChange={(e) => setSsrCommission(e.target.value)} className="border-input bg-background h-9 w-full rounded border px-2 text-sm text-right tabular-nums" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Notes</label>
            <textarea value={ssrNotes} onChange={(e) => setSsrNotes(e.target.value)} rows={2} className="border-input bg-background w-full rounded border px-2 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setSsrOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void onSaveSSR()}>Save</Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={vsrOpen}
        onOpenChange={setVsrOpen}
        title={vsrEditing ? "Edit VSR Target" : "New VSR Target"}
        contentClassName="max-w-4xl"
        bodyClassName="max-h-[85vh] overflow-y-auto p-4"
      >
        <div className="space-y-3">
          {msg && <p className="bg-destructive/10 text-destructive rounded px-2 py-1.5 text-sm">{msg}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Sales rep</label>
              <div className="relative">
                <input
                  value={vsrRepQuery}
                  onChange={(e) => {
                    const q = e.target.value;
                    setVsrRepQuery(q);
                    const found = findRepByQuery(q);
                    setVsrRepId(found ? found.id : "");
                    setShowVsrRepDropdown(true);
                  }}
                  onFocus={() => setShowVsrRepDropdown(true)}
                  onBlur={() => {
                    const found = findRepByQuery(vsrRepQuery);
                    setVsrRepId(found ? found.id : "");
                    setTimeout(() => setShowVsrRepDropdown(false), 120);
                  }}
                  placeholder="Type to filter reps..."
                  className="border-input bg-background h-9 w-full rounded border px-2 text-sm"
                />
                {showVsrRepDropdown && filterReps(vsrRepQuery).length > 0 && (
                  <div className="absolute left-0 top-full z-[80] mt-0.5 max-h-48 min-w-[20rem] overflow-auto rounded border border-border bg-background shadow-xl">
                    {filterReps(vsrRepQuery).slice(0, 25).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="w-full whitespace-nowrap px-2.5 py-2 text-left text-sm font-medium hover:bg-muted/80"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setVsrRepId(r.id);
                          setVsrRepQuery(repLabel(r));
                          setShowVsrRepDropdown(false);
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
              <input type="month" value={vsrMonth} onChange={(e) => setVsrMonth(e.target.value)} className="border-input bg-background h-9 w-full rounded border px-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium">Customer</label>
                  <div className="relative">
                    <input
                      value={vsrCustomerQuery}
                      onChange={(e) => {
                        setVsrCustomerQuery(e.target.value);
                        setVsrCustomerId("");
                        setShowVsrCustomerDropdown(true);
                      }}
                      onFocus={() => setShowVsrCustomerDropdown(true)}
                      onBlur={() => {
                        const q = vsrCustomerQuery.trim().toLowerCase();
                        const found = q ? customers.find((c) => customerLabel(c).toLowerCase() === q) : null;
                        if (found) setVsrCustomerId(found.id);
                        setTimeout(() => setShowVsrCustomerDropdown(false), 120);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const matches = filterCustomers(vsrCustomerQuery);
                          if (matches.length > 0) {
                            e.preventDefault();
                            const c = matches[0];
                            setVsrCustomerId(c.id);
                            setVsrCustomerQuery(customerLabel(c));
                            setShowVsrCustomerDropdown(false);
                          }
                        }
                      }}
                      placeholder="Type code or name to filter..."
                      className="border-input bg-background h-9 w-full rounded border px-2 text-sm"
                    />
                    {showVsrCustomerDropdown && filterCustomers(vsrCustomerQuery).length > 0 && (
                      <div className="absolute left-0 top-full z-[80] mt-0.5 max-h-48 min-w-[20rem] overflow-auto rounded border border-border bg-background shadow-xl">
                        {filterCustomers(vsrCustomerQuery).slice(0, 25).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full whitespace-nowrap px-2.5 py-2 text-left text-sm font-medium hover:bg-muted/80"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setVsrCustomerId(c.id);
                              setVsrCustomerQuery(customerLabel(c));
                              setShowVsrCustomerDropdown(false);
                            }}
                          >
                            {customerLabel(c)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Commission %</label>
                  <input
                    value={vsrCommission}
                    onChange={(e) => setVsrCommission(e.target.value)}
                    className="border-input bg-background h-9 w-full rounded border px-2 text-right text-sm tabular-nums"
                  />
                </div>
              </div>
              <p className="text-muted-foreground mt-1 text-[11px]">
                Customer&apos;s price type + month date drive line prices from the price list. Shown on Load Out sheets.
              </p>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Notes</label>
            <textarea value={vsrNotes} onChange={(e) => setVsrNotes(e.target.value)} rows={2} className="border-input bg-background w-full rounded border px-2 py-2 text-sm" />
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[720px] border-collapse border border-border text-sm">
              <thead>
                <tr className="bg-muted/60 border-b border-border">
                  <th className="border border-border px-1.5 py-1.5 text-left font-medium" style={{ width: 32 }}>#</th>
                  <th className="border border-border px-1.5 py-1.5 text-left font-medium">Product</th>
                  <th className="border border-border px-1.5 py-1.5 text-right font-medium" style={{ width: 100 }}>Target Qty</th>
                  <th className="border border-border px-1.5 py-1.5 text-right font-medium" style={{ width: 100 }}>Price</th>
                  <th className="border border-border px-1.5 py-1.5 text-right font-medium" style={{ width: 110 }}>Target Value</th>
                  <th className="border border-border px-1.5 py-1.5" style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {vsrEditLines.map((line, idx) => (
                  <tr key={line.key} className="hover:bg-muted/30">
                    <td className="border border-border px-1.5 py-0 align-middle text-muted-foreground">{idx + 1}</td>
                    <td className="border border-border p-0 align-middle">
                      <div className="relative">
                        <input
                          value={line.product_label}
                          onChange={(e) => {
                            const q = e.target.value;
                            setVsrEditLines((prev) => {
                              const next = [...prev];
                              const p = findProductByQuery(q);
                              const qty = String(next[idx]?.target_qty ?? "0");
                              const price =
                                p
                                  ? getEffectivePrice(String(p.id), customerPriceType, vsrPriceDate)
                                  : 0;
                              next[idx] = {
                                ...next[idx],
                                product_id: String(p?.id ?? ""),
                                product_label: p ? productLabel(p) : q,
                                price: p && price > 0 ? String(price) : next[idx]?.price ?? "",
                                target_value:
                                  p && price > 0 ? calcTargetValueFromPrice(String(price), qty) : next[idx]?.target_value ?? "",
                              };
                              return ensureTrailingBlank(next);
                            });
                            setLineProductDropdownRow(idx);
                          }}
                          onFocus={() => setLineProductDropdownRow(idx)}
                          onBlur={() => {
                            setTimeout(() => setLineProductDropdownRow((prev) => (prev === idx ? null : prev)), 120);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const matches = filterProducts(line.product_label);
                              if (matches.length > 0) {
                                e.preventDefault();
                                const p = matches[0];
                                const qty = String(line.target_qty ?? "0");
                                const price = getEffectivePrice(String(p.id), customerPriceType, vsrPriceDate);
                                setVsrEditLines((prev) => {
                                  const next = [...prev];
                                  next[idx] = {
                                    ...next[idx],
                                    product_id: String(p.id),
                                    product_label: productLabel(p),
                                    price: price > 0 ? String(price) : "",
                                    target_value: price > 0 ? calcTargetValueFromPrice(String(price), qty) : "",
                                  };
                                  return ensureTrailingBlank(next);
                                });
                                setLineProductDropdownRow(null);
                              }
                            }
                          }}
                          placeholder="Type code or name..."
                          className="h-8 w-full border-0 bg-transparent px-1.5 text-sm outline-none focus:bg-background focus:ring-1 focus:ring-ring"
                        />
                        {lineProductDropdownRow === idx && filterProducts(line.product_label).length > 0 && (
                          <div className="absolute left-0 top-full z-[80] mt-0.5 max-h-48 min-w-[24rem] overflow-auto rounded border border-border bg-background shadow-xl">
                            {filterProducts(line.product_label).slice(0, 30).map((p) => (
                              <button
                                key={String(p.id)}
                                type="button"
                                className="w-full whitespace-nowrap px-2.5 py-2 text-left text-sm font-medium hover:bg-muted/80"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  const qty = String(line.target_qty ?? "0");
                                  const price = getEffectivePrice(String(p.id), customerPriceType, vsrPriceDate);
                                  setVsrEditLines((prev) => {
                                    const next = [...prev];
                                    next[idx] = {
                                      ...next[idx],
                                      product_id: String(p.id),
                                      product_label: productLabel(p),
                                      price: price > 0 ? String(price) : "",
                                      target_value: price > 0 ? calcTargetValueFromPrice(String(price), qty) : "",
                                    };
                                    return ensureTrailingBlank(next);
                                  });
                                  setLineProductDropdownRow(null);
                                }}
                              >
                                {productLabel(p)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="border border-border p-0 align-middle">
                      <input
                        value={line.target_qty}
                        onChange={(e) => {
                          const v = e.target.value;
                          setVsrEditLines((prev) => {
                            const next = [...prev];
                            const price = String(next[idx]?.price ?? "0");
                            next[idx] = {
                              ...next[idx],
                              target_qty: v,
                              target_value: calcTargetValueFromPrice(price, v),
                            };
                            return ensureTrailingBlank(next);
                          });
                        }}
                        className="h-8 w-full border-0 bg-transparent px-1.5 text-right text-sm tabular-nums outline-none focus:bg-background focus:ring-1 focus:ring-ring"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="border border-border p-0 align-middle">
                      <input
                        value={line.price}
                        onChange={(e) => {
                          const v = e.target.value;
                          setVsrEditLines((prev) => {
                            const next = [...prev];
                            const qty = String(next[idx]?.target_qty ?? "0");
                            next[idx] = {
                              ...next[idx],
                              price: v,
                              target_value: calcTargetValueFromPrice(v, qty),
                            };
                            return ensureTrailingBlank(next);
                          });
                        }}
                        title="From price list by customer price type + month date; editable override"
                        className="h-8 w-full border-0 bg-transparent px-1.5 text-right text-sm tabular-nums outline-none focus:bg-background focus:ring-1 focus:ring-ring"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="border border-border bg-muted/40 px-1.5 py-1 text-right text-sm font-medium tabular-nums text-muted-foreground">
                      {n(line.target_value) > 0
                        ? n(line.target_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : ""}
                    </td>
                    <td className="border border-border p-0 align-middle">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive h-8 w-8"
                        onClick={() => {
                          setVsrEditLines((prev) => {
                            const next = prev.filter((_, i) => i !== idx);
                            return ensureTrailingBlank(next.length ? next : [blankLine("0")]);
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-primary"
            onClick={() => setVsrEditLines((prev) => ensureTrailingBlank([...prev, blankLine(String(prev.length))]))}
          >
            + Add Product
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-center">
              <div className="text-muted-foreground text-xs">Total Qty</div>
              <div className="text-base font-semibold tabular-nums">
                {vsrEditLines.reduce((s, l) => s + n(l.target_qty), 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-center">
              <div className="text-muted-foreground text-xs">Total Value</div>
              <div className="text-base font-semibold tabular-nums">
                {vsrEditLines.reduce((s, l) => s + n(l.target_value), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setVsrOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void onSaveVSR()}>Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
