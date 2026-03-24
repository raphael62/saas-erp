"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  deleteLoadOutSheet,
  saveLoadOutSheet,
  submitLoadOutSheet,
} from "@/app/dashboard/sales/load-out-sheets/actions";
import { countMonthDaysExcludingSundays } from "@/lib/month-working-days";

export type LoadOutSheet = {
  id: string;
  sheet_no: string;
  sales_rep_id?: string | null;
  location_id?: string | null;
  sales_date: string;
  vehicle_no?: string | null;
  driver_name?: string | null;
  daily_target?: number | null;
  customer_id?: string | null;
  status?: string | null;
  notes?: string | null;
  total_loadout_qty?: number | null;
  total_van_sales_qty?: number | null;
  total_sales_value?: number | null;
  sales_reps?: { id: string; code?: string | null; name: string } | null;
  locations?: { id: string; code?: string | null; name: string } | null;
  customers?: { id?: string; name?: string | null; price_type?: string | null } | null;
};

export type PriceListForLoadOut = {
  id: string;
  effective_date?: string | null;
  expiry_date?: string | null;
  is_active?: boolean | null;
  price_types?: { name?: string | null } | null;
};

export type PriceListItemForLoadOut = {
  price_list_id: string;
  product_id: string | number;
  price?: number | null;
};

export type VsrTargetForLoadOut = {
  id: string;
  sales_rep_id: string;
  month_start: string;
  customer_id?: string | null;
  customers?: { name?: string | null; price_type?: string | null } | null;
};

export type VsrLineForLoadOut = {
  vsr_monthly_target_id: string;
  product_id: string;
  target_qty?: number | null;
};

export type ProductForLoadOut = {
  id: string;
  unit?: string | null;
  pack_unit?: number | null;
  category?: string | null;
};

export type LoadOutLine = {
  id: string;
  load_out_sheet_id: string;
  product_id?: string | null;
  product_code_snapshot?: string | null;
  product_name_snapshot?: string | null;
  unit?: string | null;
  source_request_no?: string | null;
  load_out_qty?: number | null;
  top_up_qty?: number | null;
  second_load_qty?: number | null;
  add_req_qty?: number | null;
  van_stocks_qty?: number | null;
  returns_qty?: number | null;
  van_sales_qty?: number | null;
  unit_price?: number | null;
  sales_value?: number | null;
  row_no?: number | null;
};

type Rep = { id: string; code?: string | null; name: string };
type Location = { id: string; code?: string | null; name: string };

function repLabel(r: Rep) {
  const c = String(r.code ?? "").trim();
  return c ? `${c} — ${r.name}` : r.name;
}

function locLabel(l: Location) {
  const c = String(l.code ?? "").trim();
  return c ? `${c} — ${l.name}` : l.name;
}

function n(v: string | number | null | undefined) {
  const x = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
}

/** Show blank in spreadsheet cells when stored value is zero. */
function qtyStr(v: number | null | undefined) {
  if (v == null || v === 0) return "";
  return String(v);
}

function dispNum(s: string) {
  const x = n(s);
  if (x === 0) return "";
  return x.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/** Price with exactly 2 decimals. */
function dispPrice(s: string) {
  const x = n(s);
  if (x === 0) return "";
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function LoadOutSheetList({
  sheets = [],
  lines = [],
  reps = [],
  locations = [],
  vsrTargets = [],
  vsrLines = [],
  priceLists = [],
  priceListItems = [],
  products = [],
  editId,
}: {
  sheets: LoadOutSheet[];
  lines: LoadOutLine[];
  reps: Rep[];
  locations: Location[];
  vsrTargets?: VsrTargetForLoadOut[];
  vsrLines?: VsrLineForLoadOut[];
  priceLists?: PriceListForLoadOut[];
  priceListItems?: PriceListItemForLoadOut[];
  products?: ProductForLoadOut[];
  editId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sheetNo, setSheetNo] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [salesDate, setSalesDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [notes, setNotes] = useState("");
  const [lineState, setLineState] = useState<
    Array<{
      key: string;
      product_id: string;
      code: string;
      name: string;
      unit: string;
      load_out: string;
      top_up: string;
      second_load: string;
      add_req: string;
      returns: string;
      van_stocks: string;
      van_sales: string;
      price: string;
    }>
  >([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const linesBySheet = useMemo(() => {
    const m = new Map<string, LoadOutLine[]>();
    for (const l of lines) {
      const id = String(l.load_out_sheet_id);
      const arr = m.get(id) ?? [];
      arr.push(l);
      m.set(id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => Number(a.row_no ?? 0) - Number(b.row_no ?? 0));
    return m;
  }, [lines]);

  const editingSheet = editingId ? sheets.find((s) => s.id === editingId) : undefined;
  const isDraft = !editingSheet || editingSheet.status === "draft";

  const vsrLinesByTarget = useMemo(() => {
    const m = new Map<string, VsrLineForLoadOut[]>();
    for (const l of vsrLines ?? []) {
      const id = String(l.vsr_monthly_target_id);
      const arr = m.get(id) ?? [];
      arr.push(l);
      m.set(id, arr);
    }
    return m;
  }, [vsrLines]);

  const activeVsr = useMemo(() => {
    const ms = `${salesDate.slice(0, 7)}-01`;
    return (vsrTargets ?? []).find(
      (t) => String(t.sales_rep_id) === salesRepId && String(t.month_start).slice(0, 10) === ms
    );
  }, [vsrTargets, salesRepId, salesDate]);

  const vsrTargetQtyByProduct = useMemo(() => {
    const m = new Map<string, number>();
    if (!activeVsr) return m;
    for (const l of vsrLinesByTarget.get(activeVsr.id) ?? []) {
      m.set(String(l.product_id), n(l.target_qty));
    }
    return m;
  }, [activeVsr, vsrLinesByTarget]);

  const monthWorkingDays = useMemo(() => countMonthDaysExcludingSundays(salesDate), [salesDate]);

  const customerLabel = useMemo(() => {
    const fromSheet = String(editingSheet?.customers?.name ?? "").trim();
    if (fromSheet) return fromSheet;
    const fromVsr = String(activeVsr?.customers?.name ?? "").trim();
    if (fromVsr) return fromVsr;
    return "—";
  }, [editingSheet, activeVsr]);

  const customerPriceType = useMemo(() => {
    const fromSheet = String(editingSheet?.customers?.price_type ?? "").trim();
    if (fromSheet) return fromSheet;
    const fromVsr = String(activeVsr?.customers?.price_type ?? "").trim();
    if (fromVsr) return fromVsr;
    return "retail";
  }, [editingSheet, activeVsr]);

  const priceDate = useMemo(() => {
    return salesDate ? `${String(salesDate).slice(0, 10)}` : "";
  }, [salesDate]);

  const normalizedPriceLists = useMemo(() => {
    return (priceLists ?? [])
      .filter((pl) => pl.is_active !== false)
      .map((pl) => ({
        ...pl,
        priceTypeName: String(pl.price_types?.name ?? "").trim().toLowerCase(),
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

  const productById = useMemo(() => {
    const m = new Map<string, ProductForLoadOut>();
    for (const p of products ?? []) m.set(String(p.id), p);
    return m;
  }, [products]);

  function isSpirits(category: string | null | undefined, packUnit: number): boolean {
    const cat = String(category ?? "").trim();
    return cat === "GGBL Spirits" && packUnit > 0;
  }

  function lineSalesValue(line: { price: string; van_sales: string }, pid: string): number {
    const price = n(line.price);
    const vanSales = n(line.van_sales);
    if (vanSales === 0) return 0;
    const prod = productById.get(pid);
    const packUnit = prod?.pack_unit != null ? Number(prod.pack_unit) : 0;
    const category = prod?.category ?? null;
    let v: number;
    if (isSpirits(category, packUnit) && packUnit > 0) {
      v = (price / packUnit) * vanSales;
    } else {
      v = price * vanSales;
    }
    return Number.isFinite(v) ? v : 0;
  }

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

  useEffect(() => {
    if (!priceDate || !customerPriceType || lineState.length === 0) return;
    let changed = false;
    const next = lineState.map((line) => {
      if (!line.product_id) return line;
      const lookup = getEffectivePrice(line.product_id, customerPriceType, priceDate);
      if (lookup <= 0) return line;
      const cur = n(line.price);
      if (Math.abs(cur - lookup) < 0.0001) return line;
      changed = true;
      return { ...line, price: String(lookup) };
    });
    if (changed) setLineState(next);
  }, [priceDate, customerPriceType, lineState]);

  const hydrateFromSheet = useCallback(
    (s: LoadOutSheet) => {
      setEditingId(s.id);
      setSheetNo(s.sheet_no);
      setSalesRepId(String(s.sales_rep_id ?? ""));
      setLocationId(String(s.location_id ?? ""));
      setSalesDate(String(s.sales_date ?? "").slice(0, 10));
      setVehicleNo(String(s.vehicle_no ?? ""));
      setDriverName(String(s.driver_name ?? ""));
      setNotes(String(s.notes ?? ""));
      const ls = linesBySheet.get(s.id) ?? [];
      setLineState(
        ls.map((l, i) => {
          const loadOut = qtyStr(l.load_out_qty ?? undefined);
          const topUp = qtyStr(l.top_up_qty ?? undefined);
          const second = qtyStr(l.second_load_qty ?? undefined);
          const addReq = qtyStr(l.add_req_qty ?? undefined);
          const ret = qtyStr(l.returns_qty ?? undefined);
          const vs = qtyStr(l.van_stocks_qty ?? undefined);
          const vsa = qtyStr(l.van_sales_qty ?? undefined);
          const price = qtyStr(l.unit_price ?? undefined);
          return {
            key: String(l.id ?? i),
            product_id: String(l.product_id ?? ""),
            code: String(l.product_code_snapshot ?? ""),
            name: String(l.product_name_snapshot ?? ""),
            unit: String(l.unit ?? "CTN"),
            load_out: loadOut,
            top_up: topUp,
            second_load: second,
            add_req: addReq,
            returns: ret,
            van_stocks: vs,
            van_sales: vsa,
            price,
          };
        })
      );
      setMsg(null);
    },
    [linesBySheet]
  );

  useEffect(() => {
    if (editId) {
      const s = sheets.find((x) => x.id === editId);
      if (s) {
        hydrateFromSheet(s);
        setOpen(true);
      }
    }
  }, [editId, sheets, hydrateFromSheet]);

  const kpis = useMemo(() => {
    const wd = Number.isFinite(monthWorkingDays) ? monthWorkingDays : 0;
    const targetFromSheet =
      editingSheet != null && editingSheet.daily_target != null ? n(editingSheet.daily_target) : 0;

    let targetFromVsr = 0;
    if (wd > 0) {
      for (const l of lineState) {
        if (!l.product_id) continue;
        const mq = vsrTargetQtyByProduct.get(l.product_id) ?? 0;
        targetFromVsr += mq / wd;
      }
    }

    // Prefer synced header daily_target so KPI matches DB and pct is not stuck at 0 when VSR line keys differ.
    const target =
      targetFromSheet > 0 ? targetFromSheet : targetFromVsr > 0 ? targetFromVsr : 0;

    // Total load out = Load Out + Top Up + 2nd Load (for LoadOut vs target % and Total load out card)
    const load = lineState.reduce(
      (s, l) => s + n(l.load_out) + n(l.top_up) + n(l.second_load),
      0
    );
    const loadOutColumnSum = lineState.reduce((s, l) => s + n(l.load_out), 0);
    const sales = lineState.reduce((s, l) => s + n(l.van_sales), 0);
    const value = lineState.reduce((s, l) => s + lineSalesValue(l, l.product_id), 0);
    const pct = target > 0 && Number.isFinite(load) ? Math.round((load / target) * 1000) / 10 : null;
    return { target, load, loadOutColumnSum, sales, value, pct, workingDays: wd };
  }, [lineState, vsrTargetQtyByProduct, monthWorkingDays, editingSheet, productById]);

  const safeNum = (v: number, opts?: { minFrac?: number; maxFrac?: number }) =>
    Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: opts?.minFrac ?? 0, maximumFractionDigits: opts?.maxFrac ?? 4 }) : "—";

  function buildFormData() {
    const fd = new FormData();
    if (editingId) fd.set("id", editingId);
    if (sheetNo) fd.set("sheet_no", sheetNo);
    fd.set("sales_rep_id", salesRepId);
    fd.set("location_id", locationId);
    fd.set("sales_date", salesDate);
    fd.set("vehicle_no", vehicleNo);
    fd.set("driver_name", driverName);
    fd.set("notes", notes);
    lineState.forEach((l, i) => {
      if (!l.product_id) return;
      fd.set(`line_product_id_${i}`, l.product_id);
      fd.set(`line_product_code_${i}`, l.code);
      fd.set(`line_product_name_${i}`, l.name);
      fd.set(`line_unit_${i}`, l.unit);
      fd.set(`line_pack_unit_${i}`, String(productById.get(l.product_id)?.pack_unit ?? 0));
      fd.set(`line_category_${i}`, String(productById.get(l.product_id)?.category ?? ""));
      fd.set(`line_load_out_${i}`, String(n(l.load_out)));
      fd.set(`line_top_up_${i}`, String(n(l.top_up)));
      fd.set(`line_second_load_${i}`, String(n(l.second_load)));
      fd.set(`line_add_req_${i}`, String(n(l.add_req)));
      fd.set(`line_returns_${i}`, String(n(l.returns)));
      fd.set(`line_unit_price_${i}`, String(n(l.price)));
    });
    return fd;
  }

  async function handleSave(opts: { close?: boolean }) {
    setSaving(true);
    setMsg(null);
    const res = await saveLoadOutSheet(buildFormData());
    setSaving(false);
    if ("error" in res && res.error) {
      setMsg(res.error);
      return;
    }
    const newId = "id" in res ? res.id : editingId;
    if (newId) setEditingId(newId);
    if (opts.close !== false) {
      setOpen(false);
      router.replace("/dashboard/sales/load-out-sheets");
    }
    router.refresh();
  }

  async function handleSaveAndSubmit() {
    setSaving(true);
    setMsg(null);
    const res = await saveLoadOutSheet(buildFormData());
    setSaving(false);
    if ("error" in res && res.error) {
      setMsg(res.error);
      return;
    }
    const sheetId = ("id" in res && res.id) || editingId;
    if (!sheetId) {
      setMsg("Could not determine sheet id.");
      return;
    }
    const sub = await submitLoadOutSheet(sheetId);
    if ("error" in sub && sub.error) {
      setMsg(sub.error);
      return;
    }
    setOpen(false);
    router.replace("/dashboard/sales/load-out-sheets");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Load Out Sheets</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Auto-created from approved van stock requests.
          </p>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase">
              <th className="px-3 py-2">Sheet #</th>
              <th className="px-3 py-2">Sales date</th>
              <th className="px-3 py-2">Rep</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2 text-right">Load out</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sheets.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted-foreground px-3 py-10 text-center">
                  No load out sheets yet.
                </td>
              </tr>
            ) : (
              sheets.map((s) => (
                <tr key={s.id} className="border-b border-border hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{s.sheet_no}</td>
                  <td className="px-3 py-2">{s.sales_date}</td>
                  <td className="px-3 py-2">{s.sales_reps?.name ?? "—"}</td>
                  <td className="px-3 py-2">{s.locations?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(s.total_loadout_qty ?? 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.status === "submitted"
                          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                          : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      }`}
                    >
                      {s.status ?? "draft"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          hydrateFromSheet(s);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      {s.status === "draft" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive h-8 w-8"
                          onClick={async () => {
                            if (!confirm("Delete this sheet?")) return;
                            const res = await deleteLoadOutSheet(s.id);
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
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) router.replace("/dashboard/sales/load-out-sheets");
        }}
        title="Load Out Sheet"
        subtitle="Auto-generated from approved stock requests. Edit draft quantities where allowed."
        contentClassName="max-w-5xl"
        bodyClassName="max-h-[90vh] overflow-y-auto p-4"
      >
        <div className="space-y-4">
          {msg && <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{msg}</p>}

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Sales rep</label>
              <div className="border-input bg-muted/30 text-muted-foreground flex min-h-9 items-center rounded-md border px-2 text-sm">
                {reps.find((r) => r.id === salesRepId)?.name ?? "—"}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Sales date</label>
              <div className="border-input bg-muted/30 text-muted-foreground flex min-h-9 items-center rounded-md border px-2 text-sm">
                {salesDate || "—"}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Location</label>
              <div className="border-input bg-muted/30 text-muted-foreground flex min-h-9 items-center rounded-md border px-2 text-sm">
                {locations.find((l) => l.id === locationId)?.name ?? "—"}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Customer</label>
              <div
                className="border-input bg-muted/30 text-muted-foreground flex min-h-9 items-center rounded-md border px-2 text-sm"
                title="From VSR monthly target for this rep and month."
              >
                {customerLabel}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Driver</label>
              <input
                disabled={!isDraft}
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Driver name"
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Vehicle no.</label>
              <input
                disabled={!isDraft}
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                placeholder="e.g. GR-1234-20"
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 auto-rows-fr gap-2 sm:grid-cols-5">
            {(
              [
                [
                  "Daily target (ctn)",
                  kpis.workingDays > 0 ? safeNum(kpis.target, { maxFrac: 4 }) : "—",
                  "bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-100",
                ],
                [
                  "LoadOut vs target",
                  kpis.pct != null && Number.isFinite(kpis.pct) ? `${kpis.pct}%` : "—",
                  "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
                ],
                ["Total load out", safeNum(kpis.load), "bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-100"],
                ["Total van sales", safeNum(kpis.sales), "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"],
                [
                  "Sales value",
                  safeNum(kpis.value, { minFrac: 2, maxFrac: 2 }),
                  "bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100",
                ],
              ] as const
            ).map(([label, val, cls]) => (
              <div
                key={label}
                className={`flex min-h-[4.5rem] flex-col items-center justify-center rounded-lg px-2 py-2 text-center text-xs font-medium ${cls}`}
              >
                <div className="opacity-80">{label}</div>
                <div className="text-lg font-bold tabular-nums">{val}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1 text-xs font-medium">LoadOut achievement</div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${kpis.pct != null ? Math.min(100, kpis.pct) : 0}%` }}
              />
            </div>
            <div className="text-muted-foreground mt-1 text-xs">
              {kpis.pct != null ? `${kpis.pct}% of computed daily target` : "—"}
            </div>
          </div>

          <p className="text-muted-foreground text-xs">Line grid — Van Sales = Load Out + Top Up + 2nd Load − Returns.</p>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[980px] border-collapse border border-border text-xs">
              <thead>
                <tr className="bg-muted/60 border-b border-border">
                  <th className="border border-border px-1.5 py-1.5 text-left font-medium">Product</th>
                  <th className="border border-border px-1.5 py-1.5 text-center font-medium">Unit</th>
                  <th className="border border-border px-1.5 py-1.5 text-right font-medium w-[4rem]">Load out</th>
                  <th className="border border-border px-1.5 py-1.5 text-right font-medium text-sky-800 dark:text-sky-200">Top Up</th>
                  <th className="border border-border px-1.5 py-1.5 text-right font-medium text-slate-700 dark:text-slate-300">2nd Load</th>
                  <th className="border border-border px-1.5 py-1.5 text-right font-medium text-red-800 dark:text-red-300">Returns</th>
                  <th className="border border-border px-1.5 py-1.5 text-right font-medium text-amber-800 dark:text-amber-300">Add Request</th>
                  <th className="border border-border px-1.5 py-1.5 text-right font-medium text-cyan-800 dark:text-cyan-300">Van Stocks</th>
                  <th className="border border-border px-1.5 py-1.5 text-right font-medium text-emerald-800 dark:text-emerald-200">Van sales</th>
                  <th className="border border-border px-1.5 py-1.5 text-right font-medium">Price</th>
                  <th className="border border-border px-1.5 py-1.5 text-right font-medium text-violet-800 dark:text-violet-300">Sales value</th>
                </tr>
              </thead>
              <tbody>
                {lineState.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-muted-foreground border border-border px-3 py-6 text-center">
                      No lines yet — approve a van stock request for this rep, date and location.
                    </td>
                  </tr>
                ) : (
                  lineState.map((l, idx) => (
                    <tr key={l.key} className="hover:bg-muted/30">
                      <td className="border border-border px-1.5 py-0 align-middle">
                        <div className="truncate font-medium leading-8">
                          {l.code ? `${l.code} ` : ""}
                          {l.name}
                        </div>
                      </td>
                      <td className="border border-border px-1 py-0 text-center align-middle">
                        <span className="inline-block min-w-[2.5rem] text-[11px] font-medium">{l.unit}</span>
                      </td>
                      <td className="border border-border p-0 align-middle w-[4rem]">
                        <input
                          disabled
                          className="h-8 w-full min-w-0 cursor-not-allowed border-0 bg-muted/30 px-1.5 text-right text-sm tabular-nums text-muted-foreground outline-none"
                          value={l.load_out}
                          readOnly
                          title="Auto-filled from latest prior Van Stocks"
                        />
                      </td>
                      <td className="border border-border p-0 align-middle">
                        <div
                          className="h-8 w-full cursor-default bg-muted/30 px-1.5 py-1 text-right text-sm tabular-nums text-muted-foreground"
                          title="Read-only"
                        >
                          {dispNum(l.top_up)}
                        </div>
                      </td>
                      <td className="border border-border p-0 align-middle">
                        <div
                          className="h-8 w-full cursor-default bg-muted/30 px-1.5 py-1 text-right text-sm tabular-nums text-muted-foreground"
                          title="Read-only"
                        >
                          {dispNum(l.second_load)}
                        </div>
                      </td>
                      <td className="border border-border p-0 align-middle">
                        <div
                          className="h-8 w-full cursor-default bg-muted/30 px-1.5 py-1 text-right text-sm tabular-nums text-muted-foreground"
                          title="Read-only"
                        >
                          {dispNum(l.returns)}
                        </div>
                      </td>
                      <td className="border border-border p-0 align-middle">
                        <div
                          className="h-8 w-full cursor-default bg-muted/30 px-1.5 py-1 text-right text-sm tabular-nums text-muted-foreground"
                          title="Read-only"
                        >
                          {dispNum(l.add_req)}
                        </div>
                      </td>
                      <td
                        className="border border-border bg-cyan-50/50 px-1.5 py-1 text-right text-sm font-medium tabular-nums text-cyan-900 dark:bg-cyan-950/20 dark:text-cyan-200"
                        title="Returns + Add Request"
                      >
                        {dispNum(l.van_stocks)}
                      </td>
                      <td
                        className="border border-border bg-emerald-50/50 px-1.5 py-1 text-right text-sm font-medium tabular-nums text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200"
                        title="Load Out + Top Up + 2nd Load − Returns"
                      >
                        {dispNum(l.van_sales)}
                      </td>
                      <td className="border border-border p-0 align-middle">
                        <div
                          className="h-8 w-full cursor-default bg-muted/30 px-1.5 py-1 text-right text-sm tabular-nums text-muted-foreground"
                          title="From price list (customer price type + sales date)"
                        >
                          {dispPrice(l.price)}
                        </div>
                      </td>
                      <td className="border border-border px-1.5 py-1 text-right text-sm font-medium tabular-nums text-violet-900 dark:text-violet-200">
                        {(() => {
                          const v = lineSalesValue(l, l.product_id);
                          return v === 0 ? "" : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        })()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {lineState.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/50 font-semibold">
                    <td colSpan={2} className="border border-border px-2 py-2 text-right">
                      TOTALS
                    </td>
                    <td className="border border-border px-2 py-2 text-right text-sm tabular-nums">{safeNum(kpis.loadOutColumnSum)}</td>
                    <td className="border border-border px-2 py-2 text-right text-sm tabular-nums text-sky-800 dark:text-sky-200">
                      {lineState.reduce((s, l) => s + n(l.top_up), 0).toLocaleString()}
                    </td>
                    <td className="border border-border px-2 py-2 text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">
                      {lineState.reduce((s, l) => s + n(l.second_load), 0).toLocaleString()}
                    </td>
                    <td className="border border-border px-2 py-2 text-right text-sm tabular-nums">
                      {lineState.reduce((s, l) => s + n(l.returns), 0).toLocaleString()}
                    </td>
                    <td className="border border-border px-2 py-2 text-right text-sm tabular-nums text-amber-700 dark:text-amber-300">
                      {lineState.reduce((s, l) => s + n(l.add_req), 0).toLocaleString()}
                    </td>
                    <td className="border border-border px-2 py-2 text-right text-sm tabular-nums text-cyan-700 dark:text-cyan-300">
                      {lineState.reduce((s, l) => s + n(l.van_stocks), 0).toLocaleString()}
                    </td>
                    <td className="border border-border px-2 py-2 text-right text-sm tabular-nums text-emerald-800 dark:text-emerald-200">
                      {safeNum(kpis.sales)}
                    </td>
                    <td className="border border-border px-2 py-2" />
                    <td className="border border-border px-2 py-2 text-right text-sm tabular-nums text-violet-800 dark:text-violet-300">
                      {safeNum(kpis.value, { minFrac: 2, maxFrac: 2 })}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {isDraft && (
              <>
                <Button type="button" variant="secondary" disabled={saving} onClick={() => void handleSave({})}>
                  Save draft
                </Button>
                <Button
                  type="button"
                  className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={saving}
                  onClick={() => void handleSaveAndSubmit()}
                >
                  <Send className="h-4 w-4" />
                  Save & submit for sales
                </Button>
              </>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
