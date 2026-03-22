"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Package, Plus, Trophy, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  ReceiptPrintModal,
  type ReceiptPrintData,
  type ReceiptLineItem,
  type ReceiptEmptiesReceived,
} from "@/components/pos/receipt-print-modal";
import { savePosSale } from "@/app/dashboard/pos/actions";
import { getPosPerformance } from "@/app/dashboard/pos/actions-performance";
import { dailyTargetFromMonthly } from "@/lib/month-working-days";

const POS_PARKED_PREFIX = "pos-parked-";

type ParkedItem = {
  id: string;
  receipt_no: string;
  customer_name: string;
  location_name: string;
  total: number;
  parkedAt: string;
  payload: unknown;
};

const labelClass = "mb-0.5 block text-sm font-medium";
const inputClass = "h-8 w-full rounded border border-input bg-background px-2.5 text-sm";

const CURRENCY = "GH₵";

function n(v: string | number | null | undefined) {
  const raw = String(v ?? "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function fmt(value: number, fixed = 2) {
  const num = Number.isFinite(value) ? value : 0;
  return num.toFixed(fixed);
}

function fmtNum(value: number, decimals = 2) {
  const num = Number.isFinite(value) ? value : 0;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtMoney(value: number) {
  return `${CURRENCY} ${(Number.isFinite(value) ? value : n(value)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type Product = {
  id: string;
  code?: string | null;
  name: string;
  category?: string | null;
  pack_unit?: number | null;
  unit?: string | null;
  stock_quantity?: number | null;
  empties_type?: string | null;
  returnable?: boolean | null;
};

type Customer = { id: string; name: string; tax_id?: string | null };
type SalesRep = { id: string; code?: string | null; name: string };
type Location = { id: string; code?: string | null; name: string; phone?: string | null };
type PriceType = { id: string; code?: string | null; name: string };
type PriceList = {
  id: string;
  price_type_id: string;
  effective_date?: string | null;
  expiry_date?: string | null;
  price_types?: { name?: string | null } | null;
};
type PriceListItem = {
  price_list_id: string;
  product_id: string;
  price?: number | null;
  tax_rate?: number | null;
};
type Promotion = {
  id: string;
  promo_code: string;
  name: string;
  start_date: string;
  end_date: string;
  promo_budget_cartons?: number | null;
  consumed_cartons?: number | null;
  eligible_price_types?: string[] | null;
  eligible_location_ids?: string[] | null;
  days_of_week?: number[] | null;
};
type PromotionRule = {
  promotion_id: string;
  buy_product_id: string | number;
  buy_qty?: number | null;
  buy_unit?: string | null;
  reward_product_id: string | number;
  reward_qty?: number | null;
  reward_unit?: string | null;
  row_no?: number | null;
};
type SSRTarget = {
  id: string;
  sales_rep_id: string;
  month_start: string;
  target_value?: number | null;
  commission_pct?: number | null;
};
type ParkedSale = {
  id: string;
  receipt_no: string;
  customer_name: string;
  location_name: string;
  total: number;
};

type Line = {
  key: string;
  product_id: string;
  item_code: string;
  item_name: string;
  price_type: string;
  pack_unit: string;
  btl_qty: string;
  ctn_qty: string;
  price_tax_inc: string;
  tax_rate: string;
  value_tax_inc: string;
  category?: string | null;
  isPromo?: boolean;
};

function blankLine(key: string, defaultPriceType: string): Line {
  return {
    key,
    product_id: "",
    item_code: "",
    item_name: "",
    price_type: defaultPriceType,
    pack_unit: "",
    btl_qty: "",
    ctn_qty: "",
    price_tax_inc: "",
    tax_rate: "0",
    value_tax_inc: "",
  };
}

function isPromoLine(line: Line) {
  return String(line.item_name || "").startsWith("Free - ") || line.isPromo === true;
}

function hasLineData(line: Line) {
  const price = n(line.price_tax_inc);
  return Boolean(
    line.product_id || line.item_name || n(line.btl_qty) !== 0 || n(line.ctn_qty) !== 0 || price !== 0
  );
}

function dateOrMin(value?: string | null) {
  return String(value ?? "0000-01-01");
}

type PaymentAccount = { id: string; code?: string | null; name: string; account_type?: string | null };
type PaymentMethod = { id: string; code?: string | null; name: string };

const PAYMENT_METHODS_FALLBACK: PaymentMethod[] = [
  { id: "cash", code: "cash", name: "Cash" },
  { id: "mobile_money", code: "mobile_money", name: "Mobile Money" },
  { id: "bank_transfer", code: "bank_transfer", name: "Bank Transfer" },
  { id: "cheque", code: "cheque", name: "Cheque" },
  { id: "other", code: "other", name: "Other" },
];

type PaymentRow = {
  key: string;
  accountId: string;
  methodId: string;
  reference: string;
  amount: string;
};

function blankPaymentRow(
  key: string,
  accountId: string,
  methodId: string,
  amount = ""
): PaymentRow {
  return {
    key,
    accountId,
    methodId,
    reference: "",
    amount,
  };
}

function accountLabel(a: PaymentAccount) {
  return a.code ? `${a.code} - ${a.name}` : a.name;
}

function methodLabel(m: PaymentMethod) {
  return m.name ?? String(m.code ?? "");
}

function PaymentDialogContent({
  total,
  paymentAccounts,
  paymentMethods,
  onComplete,
  onCancel,
}: {
  total: number;
  paymentAccounts: PaymentAccount[];
  paymentMethods: PaymentMethod[];
  onComplete: (amountPaid: number, paymentMethod: string, paymentAccountId?: string | null) => void | Promise<void>;
  onCancel: () => void;
}) {
  const methods: PaymentMethod[] =
    Array.isArray(paymentMethods) && paymentMethods.length > 0
      ? paymentMethods.filter((m) => m && (m.id || m.code || m.name))
      : PAYMENT_METHODS_FALLBACK;
  const accounts: PaymentAccount[] =
    Array.isArray(paymentAccounts) && paymentAccounts.length > 0
      ? paymentAccounts.filter((a) => a && (a.id || a.name))
      : [{ id: "default", code: "CASH", name: "Cash", account_type: "cash" }];
  const firstAccountId = accounts[0]?.id ?? "default";
  const firstMethodId = methods[0]?.id ?? methods[0]?.code ?? "cash";

  const [rows, setRows] = useState<PaymentRow[]>(() => [
    blankPaymentRow(`pay-${Date.now()}-0`, firstAccountId, firstMethodId, ""),
  ]);
  const [allowCredit, setAllowCredit] = useState(false);
  const [loading, setLoading] = useState(false);

  const paid = useMemo(() => {
    return rows.reduce((sum, r) => sum + n(r.amount), 0);
  }, [rows]);

  const remaining = total - paid;
  const canComplete =
    allowCredit || (total >= 0 ? paid >= total : paid <= total);
  const hasNonZeroRow = rows.some((r) => n(r.amount) !== 0);

  const addRow = () => {
    setRows((prev) => {
      const usedAccountIds = new Set(prev.map((r) => r.accountId).filter(Boolean));
      const unusedAccount = accounts.find((a) => !usedAccountIds.has(a.id));
      const accountIdForNewRow = unusedAccount?.id ?? firstAccountId;
      return [
        ...prev,
        blankPaymentRow(
          `pay-${Date.now()}-${prev.length}`,
          accountIdForNewRow,
          firstMethodId
        ),
      ];
    });
  };

  const updateRow = (idx: number, patch: Partial<PaymentRow>) => {
    setRows((prev) => {
      const next = [...prev];
      if (!next[idx]) return prev;
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const removeRow = (idx: number) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const handleComplete = async () => {
    if (!canComplete || !hasNonZeroRow) return;
    setLoading(true);
    try {
      const amountPaid = paid;
      const firstRow = rows.find((r) => n(r.amount) !== 0);
      const methodName =
        firstRow && methods.find((m) => m.id === firstRow.methodId || m.code === firstRow.methodId)
          ? (methods.find((m) => m.id === firstRow.methodId || m.code === firstRow.methodId)?.name ?? "Cash")
          : methods.length > 0
            ? methods[0].name
            : "Cash";
      const accountId = firstRow?.accountId && firstRow.accountId !== "default" ? firstRow.accountId : null;
      await onComplete(amountPaid, methodName, accountId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || "Payment failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
          <p className="text-sm text-muted-foreground">Paid</p>
          <p className="text-lg font-bold tabular-nums">{fmtMoney(paid)}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
          <p className="text-sm text-muted-foreground">Remaining</p>
          <p
            className={`text-lg font-bold tabular-nums ${
              remaining < 0 ? "text-green-600 dark:text-green-500" : remaining > 0 ? "text-destructive" : ""
            }`}
          >
            {fmtMoney(remaining)}
          </p>
        </div>
        <div className="flex items-end rounded-lg border border-border bg-muted/20 px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowCredit}
              onChange={(e) => setAllowCredit(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Allow unpaid balance (Credit)
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[32rem] table-fixed text-sm">
          <thead>
            <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 12%, white)" }}>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ width: "28%" }}>
                Account
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ width: "22%" }}>
                Method
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-left font-medium" style={{ width: "20%" }}>
                Reference
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-right font-medium" style={{ width: "20%" }}>
                Amount
              </th>
              <th className="border-b border-border px-2 py-2 text-center font-medium" style={{ width: "10%" }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.key} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                <td className="border-b border-r border-border px-2 py-1">
                  <select
                    value={row.accountId}
                    onChange={(e) => updateRow(idx, { accountId: e.target.value })}
                    className={`${inputClass} h-8 border-0 bg-transparent focus:bg-background`}
                  >
                    {accounts.length === 0 ? (
                      <option value="">-- Select --</option>
                    ) : (
                      accounts.map(function (a) {
                        return (
                          <option key={a.id} value={a.id}>
                            {accountLabel(a)}
                          </option>
                        );
                      })
                    )}
                  </select>
                </td>
                <td className="border-b border-r border-border px-2 py-1">
                  <select
                    value={row.methodId}
                    onChange={(e) => updateRow(idx, { methodId: e.target.value })}
                    className={`${inputClass} h-8 border-0 bg-transparent focus:bg-background`}
                  >
                    {methods.map(function (m) {
                      return (
                        <option key={m.id} value={m.id}>
                          {methodLabel(m)}
                        </option>
                      );
                    })}
                  </select>
                </td>
                <td className="border-b border-r border-border px-1 py-1">
                  <input
                    type="text"
                    value={row.reference}
                    onChange={(e) => updateRow(idx, { reference: e.target.value })}
                    placeholder="Optional"
                    className="h-8 w-full rounded border-0 bg-transparent px-2 text-sm outline-none focus:bg-background focus:ring-1 focus:ring-inset focus:ring-border"
                  />
                </td>
                <td className="border-b border-r border-border px-2 py-1 text-right">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => updateRow(idx, { amount: e.target.value })}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v) updateRow(idx, { amount: fmtNum(n(v), 2) });
                    }}
                    className="h-8 w-full rounded border-0 bg-transparent px-2 text-right text-sm tabular-nums outline-none focus:bg-background focus:ring-1 focus:ring-inset focus:ring-border"
                    placeholder=""
                  />
                </td>
                <td className="border-b border-border px-1 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="rounded p-1 text-destructive hover:bg-destructive/10"
                    aria-label="Delete row"
                  >
                    <X className="mx-auto h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          className="border-[var(--navbar)] text-[var(--navbar)] hover:bg-[var(--navbar)]/10"
          onClick={addRow}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add payment row
        </Button>
        <Button
          style={{ backgroundColor: "var(--navbar)", color: "white" }}
          className="border-transparent"
          disabled={!canComplete || !hasNonZeroRow || loading}
          onClick={handleComplete}
        >
          {loading ? "Processing…" : "Complete Sale"}
        </Button>
      </div>
    </div>
  );
}

export function NewPOSSale({
  customers,
  salesReps,
  locations,
  products,
  priceTypes,
  priceLists,
  priceListItems,
  promotions,
  promotionRules = [],
  ssrTargets,
  parkedSales,
  defaultPriceType,
  orgName = "",
  orgPhone = "",
  cashierName,
  paymentAccounts = [],
  paymentMethods = [],
}: {
  customers: Customer[];
  salesReps: SalesRep[];
  locations: Location[];
  products: Product[];
  priceTypes: PriceType[];
  priceLists: PriceList[];
  priceListItems: PriceListItem[];
  promotions: Promotion[];
  promotionRules?: PromotionRule[];
  ssrTargets: SSRTarget[];
  parkedSales: ParkedSale[];
  defaultPriceType: string;
  orgName?: string;
  orgPhone?: string;
  cashierName?: string;
  paymentAccounts?: PaymentAccount[];
  paymentMethods?: PaymentMethod[];
}) {
  const cashier = cashierName ?? "Cashier";
  const today = new Date().toISOString().slice(0, 10);
  const [saleDate, setSaleDate] = useState(today);
  const [customerId, setCustomerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine("0", defaultPriceType)]);
  const [lineDropdown, setLineDropdown] = useState<{ row: number; field: "code" | "name" } | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptPrintData | null>(null);

  const loadParkedFromStorage = useCallback((): ParkedItem[] => {
    if (typeof window === "undefined") return [];
    const items: ParkedItem[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(POS_PARKED_PREFIX)) continue;
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const payload = JSON.parse(raw) as { saleDate?: string; customerId?: string; locationId?: string; salesRepId?: string; notes?: string; lines?: Line[]; emptiesRcvd?: Record<string, string>; grandTotal?: number; parkedAt?: string };
        const customerName = customers.find((c) => c.id === payload.customerId)?.name ?? "Walk-in";
        const locationName = locations.find((l) => l.id === payload.locationId)?.name ?? "—";
        const total: number = Number.isFinite(payload.grandTotal) ? (payload.grandTotal ?? 0) : 0;
        const receiptNo = `PARK-${(payload.saleDate ?? "").replace(/-/g, "")}-${key.replace(POS_PARKED_PREFIX, "").slice(-6)}`;
        const ts = payload.parkedAt ? new Date(payload.parkedAt).getTime() : parseInt(key.replace(POS_PARKED_PREFIX, ""), 10);
        const parkedAt = Number.isFinite(ts) ? new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }) : "—";
        items.push({
          id: key,
          receipt_no: receiptNo,
          customer_name: customerName,
          location_name: locationName,
          total,
          parkedAt,
          payload,
        });
      } catch {
        // skip invalid
      }
    }
    items.sort((a, b) => b.id.localeCompare(a.id));
    return items;
  }, [customers, locations]);

  const [parkedFromStorage, setParkedFromStorage] = useState<ParkedItem[]>([]);
  const refreshParked = useCallback(() => setParkedFromStorage(loadParkedFromStorage()), [loadParkedFromStorage]);
  useEffect(() => {
    refreshParked();
  }, [refreshParked]);

  type DailyPerf = {
    todaySales: number;
    todayInvoiceCount: number;
    dailyTarget: number;
    commissionPct: number;
    todayCommission: number;
    mtdCommission: number;
    qualifyingDays: number;
    atRisk: number;
    achievementPct: number;
  };
  const [dailyPerf, setDailyPerf] = useState<DailyPerf | null>(null);
  useEffect(() => {
    if (!saleDate || !salesRepId?.trim()) {
      setDailyPerf(null);
      return;
    }
    const monthKey = saleDate.slice(0, 7);
    getPosPerformance(monthKey, salesRepId.trim(), saleDate).then((res) => {
      const rep = res.reps[0];
      if (!rep) {
        setDailyPerf(null);
        return;
      }
      const todaySales = rep.salesByDay[saleDate] ?? 0;
      const todayCommission =
        rep.dailyTarget > 0 && todaySales >= rep.dailyTarget
          ? todaySales * (rep.commissionPct / 100)
          : 0;
      setDailyPerf({
        todaySales,
        todayInvoiceCount: rep.todayInvoiceCount ?? 0,
        dailyTarget: rep.dailyTarget,
        commissionPct: rep.commissionPct,
        todayCommission,
        mtdCommission: rep.commissionEarned,
        qualifyingDays: rep.qualifyingDays,
        atRisk: rep.commissionAtRisk,
        achievementPct: rep.achievementPct,
      });
    });
  }, [saleDate, salesRepId]);

  const searchParams = useSearchParams();
  const resumeKey = searchParams.get("resume");
  useEffect(() => {
    if (!resumeKey || !resumeKey.startsWith(POS_PARKED_PREFIX)) return;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(resumeKey);
      if (!raw) return;
      const payload = JSON.parse(raw) as { saleDate?: string; customerId?: string; locationId?: string; salesRepId?: string; notes?: string; lines?: Line[]; emptiesRcvd?: Record<string, string> };
      if (payload.saleDate) setSaleDate(payload.saleDate);
      if (payload.customerId) setCustomerId(payload.customerId);
      if (payload.locationId) setLocationId(payload.locationId);
      if (payload.salesRepId) setSalesRepId(payload.salesRepId);
      if (payload.notes) setNotes(payload.notes);
      if (payload.lines?.length) {
        const last = payload.lines[payload.lines.length - 1];
        const withBlank = hasLineData(last) ? [...payload.lines, blankLine(String(payload.lines.length), defaultPriceType)] : payload.lines;
        setLines(withBlank.map((l, i) => ({ ...l, key: String(i) })));
      }
      if (payload.emptiesRcvd) setEmptiesRcvd(payload.emptiesRcvd);
      window.localStorage.removeItem(resumeKey);
      refreshParked();
      window.history.replaceState({}, "", "/dashboard/pos/new-sale");
    } catch {
      // ignore
    }
  }, [resumeKey, defaultPriceType, refreshParked]);

  const rulesByPromotionId = useMemo(() => {
    const map = new Map<string, PromotionRule[]>();
    for (const r of promotionRules ?? []) {
      const key = String(r.promotion_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [promotionRules]);

  const normalizedPriceLists = useMemo(() => {
    return (priceLists ?? []).map((pl) => ({
      id: pl.id,
      priceTypeName: (pl.price_types?.name ?? "").trim().toLowerCase(),
      effective_date: pl.effective_date,
      expiry_date: pl.expiry_date,
    }));
  }, [priceLists]);

  const priceItemByListAndProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of priceListItems ?? []) {
      const key = `${item.price_list_id}|${item.product_id}`;
      const p = Number(item.price ?? 0);
      map.set(key, Number.isFinite(p) ? p : 0);
    }
    return map;
  }, [priceListItems]);

  const productLookup = useMemo(() => {
    const byId = new Map<string, Product>();
    const byCode = new Map<string, Product>();
    const byName = new Map<string, Product>();
    for (const p of products ?? []) {
      byId.set(String(p.id), p);
      const code = (p.code ?? "").toLowerCase().trim();
      if (code) byCode.set(code, p);
      byName.set(p.name.toLowerCase().trim(), p);
    }
    return { byId, byCode, byName };
  }, [products]);

  function toCartons(qty: number, unit: string | null | undefined, product: Product | undefined) {
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    if (String(unit ?? "cartons").toLowerCase() !== "bottles") return qty;
    const pack = n(product?.pack_unit);
    if (pack <= 0) return 0;
    return qty / pack;
  }

  function promoEligible(promo: Promotion, dateVal: string, priceType: string, locationIdVal: string) {
    const start = String(promo.start_date ?? "");
    const end = String(promo.end_date ?? "");
    if (start && dateVal < start) return false;
    if (end && dateVal > end) return false;
    const allowedPriceTypes = (promo.eligible_price_types ?? []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    if (allowedPriceTypes.length > 0 && !allowedPriceTypes.includes(priceType.trim().toLowerCase())) return false;
    const allowedLocations = (promo.eligible_location_ids ?? []).map((x) => String(x));
    if (allowedLocations.length > 0 && locationIdVal && !allowedLocations.includes(locationIdVal)) return false;
    return true;
  }

  function buildLinesWithPromotions(baseLines: Line[]) {
    if (!saleDate) return [...baseLines];
    const priceType = defaultPriceType;
    const eligiblePromotions = promotions.filter((p) => promoEligible(p, saleDate, priceType, locationId));
    const remainingBudgetByPromo = new Map<string, number>();
    for (const promo of eligiblePromotions) {
      const budget = promo.promo_budget_cartons == null ? Number.POSITIVE_INFINITY : n(promo.promo_budget_cartons) - n(promo.consumed_cartons);
      remainingBudgetByPromo.set(String(promo.id), Number.isFinite(budget) ? Math.max(0, budget) : Number.POSITIVE_INFINITY);
    }
    const generated: Line[] = [];
    for (let rowIndex = 0; rowIndex < baseLines.length; rowIndex += 1) {
      const row = baseLines[rowIndex];
      generated.push(row);
      if (!row.product_id || !hasLineData(row)) continue;
      for (const promo of eligiblePromotions) {
        const rules = [...(rulesByPromotionId.get(String(promo.id)) ?? [])]
          .sort((a, b) => Number(a.row_no ?? 0) - Number(b.row_no ?? 0))
          .filter((r) => String(r.buy_product_id) === String(row.product_id));
        for (const rule of rules) {
          const rewardProduct = productLookup.byId.get(String(rule.reward_product_id));
          if (!rewardProduct) continue;
          const buyUnit = String(rule.buy_unit ?? "cartons").toLowerCase() === "bottles" ? "bottles" : "cartons";
          const rewardUnit = String(rule.reward_unit ?? "cartons").toLowerCase() === "bottles" ? "bottles" : "cartons";
          const buyQtyThreshold = n(rule.buy_qty);
          if (buyQtyThreshold <= 0) continue;
          const sourceQty = buyUnit === "bottles" ? n(row.btl_qty) : n(row.ctn_qty);
          const triggerCount = Math.floor(sourceQty / buyQtyThreshold);
          if (triggerCount <= 0) continue;
          const rewardQtyRaw = triggerCount * n(rule.reward_qty);
          if (rewardQtyRaw <= 0) continue;
          const rewardQtyCartons = rewardUnit === "bottles" ? rewardQtyRaw / Math.max(1, n(rewardProduct.pack_unit)) : rewardQtyRaw;
          if (rewardQtyCartons <= 0) continue;
          const promoBudgetLeft = remainingBudgetByPromo.get(String(promo.id)) ?? Number.POSITIVE_INFINITY;
          let finalCartons = rewardQtyCartons;
          if (Number.isFinite(promoBudgetLeft)) {
            finalCartons = Math.min(finalCartons, Math.max(0, promoBudgetLeft));
            remainingBudgetByPromo.set(String(promo.id), promoBudgetLeft - finalCartons);
          }
          if (finalCartons <= 0) continue;
          const rewardPack = n(rewardProduct.pack_unit);
          generated.push({
            key: `promo-${rowIndex}-${promo.id}-${rule.row_no ?? 0}-${rewardProduct.id}`,
            product_id: rewardProduct.id,
            item_code: rewardProduct.code ?? "",
            item_name: `Free - ${rewardProduct.name}`,
            price_type: "",
            pack_unit: fmtNum(Math.round(rewardPack), 0),
            btl_qty: "",
            ctn_qty: fmt(finalCartons, 4),
            price_tax_inc: fmtNum(0, 2),
            tax_rate: "0",
            value_tax_inc: "0",
            isPromo: true,
          });
        }
      }
    }
    return generated;
  }

  useEffect(() => {
    setLines((prev) => {
      try {
        const nonPromo = prev.filter((l) => !isPromoLine(l));
        const working = nonPromo.filter((l) => hasLineData(l));
        const withPromos = buildLinesWithPromotions(working);
        const rekeyed = withPromos.map((l, i) => ({ ...l, key: String(i) }));
        const last = rekeyed[rekeyed.length - 1];
        if (!last || hasLineData(last)) rekeyed.push(blankLine(String(rekeyed.length), defaultPriceType));
        const norm = (arr: Line[]) => arr.map((l) => ({ product_id: l.product_id, ctn_qty: l.ctn_qty, btl_qty: l.btl_qty, item_name: l.item_name }));
        if (JSON.stringify(norm(prev)) === JSON.stringify(norm(rekeyed))) return prev;
        return rekeyed;
      } catch {
        return prev;
      }
    });
  }, [saleDate, locationId, defaultPriceType, promotions, rulesByPromotionId, productLookup.byId, lines]);

  function getEffectivePrice(productId: string, priceTypeName: string, onDate: string): { price: number; tax_rate: number } | null {
    const key = priceTypeName.trim().toLowerCase();
    if (!productId || !key || !onDate) return null;
    const candidates = normalizedPriceLists
      .filter((pl) => {
        if (pl.priceTypeName !== key) return false;
        const eff = dateOrMin(pl.effective_date);
        const exp = pl.expiry_date ? String(pl.expiry_date).slice(0, 10) : "";
        if (eff > onDate) return false;
        if (exp && exp < onDate) return false;
        return true;
      })
      .sort((a, b) => dateOrMin(b.effective_date).localeCompare(dateOrMin(a.effective_date)));

    for (const pl of candidates) {
      const price = priceItemByListAndProduct.get(`${pl.id}|${productId}`);
      if (price != null && price > 0) {
        const item = priceListItems.find(
          (i) => i.price_list_id === pl.id && String(i.product_id) === String(productId)
        );
        const taxRate = item?.tax_rate != null ? n(item.tax_rate) : 0;
        return { price, tax_rate: taxRate };
      }
    }
    return null;
  }

  function isSpirits(category: string | null | undefined, packUnit: number): boolean {
    return String(category ?? "").trim() === "GGBL Spirits" && packUnit > 0;
  }

  function computeLineValue(line: Line, product: Product | undefined): string {
    const price = n(line.price_tax_inc);
    const packUnit = n(line.pack_unit);
    const btlQty = n(line.btl_qty);
    const ctnQty = n(line.ctn_qty);
    const category = product?.category ?? line.category;
    if (isSpirits(category, packUnit)) {
      const qtyBottles = btlQty !== 0 ? btlQty : (ctnQty !== 0 ? ctnQty * packUnit : 0);
      if (packUnit <= 0) return fmtNum(0, 2);
      return fmtNum((price / packUnit) * qtyBottles, 2);
    }
    const qty = btlQty !== 0 ? (packUnit > 0 ? btlQty / packUnit : 0) : (ctnQty !== 0 ? ctnQty : 0);
    return fmtNum(price * qty, 2);
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const merged = { ...current, ...patch };
      const product = merged.product_id ? productLookup.byId.get(merged.product_id) : undefined;
      merged.value_tax_inc = computeLineValue(merged, product);

      next[index] = merged;
      const last = next[next.length - 1];
      if (last && hasLineData(last)) {
        next.push(blankLine(String(next.length), defaultPriceType));
      }
      return next;
    });
  }

  function deleteLine(index: number) {
    setLines((prev) => {
      if (prev.length <= 1) return [blankLine("0", defaultPriceType)];
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0 || hasLineData(next[next.length - 1])) {
        next.push(blankLine(String(next.length), defaultPriceType));
      }
      return next;
    });
  }

  function applyProductToRow(index: number, product: Product, focusCtnQty?: boolean) {
    const effectivePrice = getEffectivePrice(String(product.id), defaultPriceType, saleDate);
    const priceTaxInc = effectivePrice ? fmtNum(effectivePrice.price, 2) : "0.00";
    const taxRate = effectivePrice ? fmt(effectivePrice.tax_rate, 3) : "0";
    updateLine(index, {
      product_id: String(product.id),
      item_code: product.code ?? "",
      item_name: product.name,
      pack_unit: fmtNum(Math.round(n(product.pack_unit)), 0),
      price_type: defaultPriceType,
      price_tax_inc: priceTaxInc,
      tax_rate: taxRate,
      category: product.category,
    });
    setLineDropdown(null);
    if (focusCtnQty) {
      setTimeout(() => document.getElementById(`ctn-qty-${index}`)?.focus(), 0);
    }
  }

  function resolveProduct(index: number, value: string, by: "code" | "name") {
    const q = value.toLowerCase().trim();
    if (!q) return;
    const product = products.find((p) => {
      const code = (p.code ?? "").toLowerCase();
      const name = p.name.toLowerCase();
      if (by === "code") return code.includes(q) || name.includes(q);
      return name.includes(q) || code.includes(q);
    });
    if (product) applyProductToRow(index, product);
  }

  function ctnFromBtl(btlQty: string | number, packUnit: string | number) {
    const pack = Math.round(n(packUnit));
    if (pack <= 0) return "";
    return fmtNum(Math.round(n(btlQty)) / pack, 2);
  }

  function fmtInt(value: string | number | null | undefined) {
    const num = Math.round(n(value));
    return num === 0 ? "" : fmtNum(num, 0);
  }

  function btlFromCtn(ctnQty: string | number, packUnit: string | number) {
    const pack = n(packUnit);
    if (pack <= 0) return "";
    return fmt(n(ctnQty) * pack, 4);
  }

  function isEmptiesProduct(product: Product | undefined): boolean {
    return Boolean(product && String(product.name ?? "").toLowerCase().includes("empties"));
  }

  const totals = useMemo(() => {
    let ctnTotal = 0;
    let subTotal = 0;
    let vatTotal = 0;
    let grandTotal = 0;
    for (const line of lines) {
      const product = line.product_id ? productLookup.byId.get(line.product_id) : undefined;
      if (isEmptiesProduct(product)) continue;

      const packUnit = n(line.pack_unit);
      const btlQty = n(line.btl_qty);
      const ctnQty = btlQty !== 0 ? (packUnit > 0 ? btlQty / packUnit : 0) : n(line.ctn_qty);
      ctnTotal += ctnQty;

      const value = n(line.value_tax_inc);
      grandTotal += value;
      const taxRate = n(line.tax_rate);
      const divisor = 1 + taxRate / 100;
      subTotal += divisor > 0 ? value / divisor : value;
      vatTotal += value - (divisor > 0 ? value / divisor : value);
    }
    return {
      ctn_qty: fmtNum(ctnTotal, 4),
      sub_total: subTotal,
      vat: vatTotal,
      grand_total: grandTotal,
    };
  }, [lines, productLookup.byId]);

  const emptiesDepositValue = useMemo(() => {
    let sum = 0;
    for (const line of lines) {
      if (!line.product_id) continue;
      const product = productLookup.byId.get(String(line.product_id));
      if (!isEmptiesProduct(product)) continue;
      sum += n(line.value_tax_inc);
    }
    return sum;
  }, [lines, productLookup.byId]);

  const emptiesTableRows = useMemo(() => {
    const grouped = new Map<string, { emptiesType: string; expCtn: number }>();
    for (const line of lines) {
      if (!line.product_id) continue;
      const ctnQty = n(line.btl_qty) !== 0 ? (n(line.pack_unit) > 0 ? n(line.btl_qty) / n(line.pack_unit) : 0) : n(line.ctn_qty);
      if (ctnQty <= 0) continue;
      const product = productLookup.byId.get(String(line.product_id));
      if (!product || !product.returnable) continue;
      const emptiesType = String(product.empties_type ?? "").trim() || "—";
      const curr = grouped.get(emptiesType) ?? { emptiesType, expCtn: 0 };
      curr.expCtn += ctnQty;
      grouped.set(emptiesType, curr);
    }
    return Array.from(grouped.values());
  }, [lines, productLookup.byId]);

  const [emptiesRcvd, setEmptiesRcvd] = useState<Record<string, string>>({});
  const updateEmptiesRcvd = (emptiesType: string, value: string) => {
    setEmptiesRcvd((prev) => ({ ...prev, [emptiesType]: value }));
  };

  const customerDisplay = customerId
    ? customers.find((c) => c.id === customerId)?.name ?? "Walk-in"
    : "Walk-in";

  const hasItems = lines.some((l) => hasLineData(l));
  const grandTotalNum = totals.grand_total + emptiesDepositValue;

  const selectedRepTarget = salesRepId
    ? ssrTargets.find(
        (t) =>
          String(t.sales_rep_id) === String(salesRepId) &&
          t.month_start?.startsWith(saleDate.slice(0, 7))
      )
    : ssrTargets[0];
  const monthlyTarget = n(selectedRepTarget?.target_value ?? 0);
  const monthFirst = saleDate ? `${saleDate.slice(0, 7)}-01` : "";
  const dailyTarget = dailyTargetFromMonthly(monthlyTarget, monthFirst);
  const commissionPct = n(selectedRepTarget?.commission_pct ?? 0) / 100;
  const dp = dailyPerf;
  const todaySales = dp?.todaySales ?? 0;
  const todayCommission = dp?.todayCommission ?? 0;
  const mtdCommission = dp?.mtdCommission ?? 0;
  const atRisk = dp?.atRisk ?? (monthlyTarget * commissionPct);
  const qualifyingDays = dp?.qualifyingDays ?? 0;
  const todayInvoiceCount = dp?.todayInvoiceCount ?? 0;
  const dailyAchievementPct = dailyTarget > 0 ? (todaySales / dailyTarget) * 100 : 0;
  const targetReached = dailyTarget > 0 && todaySales >= dailyTarget;

  const customerOptions = [{ id: "", name: "Walk-in" }, ...customers];

  return (
    <div className="flex flex-col gap-6 xl:flex-row">
      <div className="min-w-0 flex-1 space-y-4 xl:max-w-4xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">New POS Sale</h1>
            <p className="text-sm text-muted-foreground">Customer: {customerDisplay}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!hasItems}
              className={`min-h-[44px] touch-manipulation ${hasItems ? "border-[var(--navbar)] text-[var(--navbar)]" : "opacity-70"}`}
              onClick={() => {
                if (!hasItems) return;
                const payload = {
                  saleDate,
                  customerId,
                  locationId,
                  salesRepId,
                  notes,
                  lines: lines.filter((l) => hasLineData(l)),
                  emptiesRcvd,
                  grandTotal: totals.grand_total + emptiesDepositValue,
                  parkedAt: new Date().toISOString(),
                };
                const key = `${POS_PARKED_PREFIX}${Date.now()}`;
                try {
                  localStorage.setItem(key, JSON.stringify(payload));
                  refreshParked();
                  setLines([blankLine("0", defaultPriceType)]);
                  setEmptiesRcvd({});
                } catch {
                  alert("Could not park sale.");
                }
              }}
            >
              Park Sale
            </Button>
            <Button
              style={{ backgroundColor: "var(--navbar)", color: "white" }}
              disabled={!hasItems}
              className="min-h-[44px] touch-manipulation border-transparent hover:opacity-90"
              onClick={() => {
                if (!hasItems) return;
                if (!salesRepId) {
                  alert("Please select a Sales Rep.");
                  return;
                }
                setPaymentOpen(true);
              }}
            >
              Take Payment
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Sale Date</label>
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Customer</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className={inputClass}
            >
              {customerOptions.map((c) => (
                <option key={c.id || "walkin"} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Location</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className={inputClass}
            >
              <option value="">-- Select --</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code ? `${l.code} - ${l.name}` : l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>
              Sales Rep <span className="text-destructive">*</span>
            </label>
            <select
              value={salesRepId}
              onChange={(e) => setSalesRepId(e.target.value)}
              className={inputClass}
            >
              <option value="">-- Select --</option>
              {salesReps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code ? `${r.code} - ${r.name}` : r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className={`${inputClass} min-h-[2rem] resize-y`}
              rows={1}
            />
          </div>
        </div>

        <p className="text-sm text-muted-foreground">Select a product to view available stock.</p>

        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 12%, white)" }}>
                <th className="border-b border-r border-border px-2 py-2 text-left" style={{ width: 36 }}>#</th>
                <th className="border-b border-r border-border px-2 py-2 text-left" style={{ width: 90 }}>Item Code</th>
                <th className="border-b border-r border-border px-2 py-2 text-left" style={{ width: 160 }}>Item Name</th>
                <th className="border-b border-r border-border px-2 py-2 text-left" style={{ width: 100 }}>Price Type</th>
                <th className="border-b border-r border-border px-2 py-2 text-right" style={{ width: 75 }}>Pack Unit</th>
                <th className="border-b border-r border-border px-2 py-2 text-right" style={{ width: 80 }}>Btl Qty</th>
                <th className="border-b border-r border-border px-2 py-2 text-right" style={{ width: 80 }}>Ctn Qty</th>
                <th className="border-b border-r border-border px-2 py-2 text-right" style={{ width: 100 }}>Price (Tax-Inc)</th>
                <th className="border-b border-r border-border px-2 py-2 text-right" style={{ width: 100 }}>Value (Tax-Inc)</th>
                <th className="border-b border-border px-2 py-2 text-center" style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const codeQuery = line.item_code.toLowerCase().trim();
                const nameQuery = line.item_name.toLowerCase().trim();
                const codeMatches = products
                  .filter(
                    (p) =>
                      `${p.code ?? ""}`.toLowerCase().includes(codeQuery) ||
                      p.name.toLowerCase().includes(codeQuery)
                  )
                  .sort((a, b) => {
                    const aHasEmpties = Boolean(String(a.empties_type ?? "").trim() || String(a.name ?? "").toLowerCase().includes("empties"));
                    const bHasEmpties = Boolean(String(b.empties_type ?? "").trim() || String(b.name ?? "").toLowerCase().includes("empties"));
                    if (aHasEmpties && !bHasEmpties) return -1;
                    if (!aHasEmpties && bHasEmpties) return 1;
                    return 0;
                  });
                const nameMatches = products
                  .filter(
                    (p) =>
                      p.name.toLowerCase().includes(nameQuery) ||
                      `${p.code ?? ""}`.toLowerCase().includes(nameQuery)
                  )
                  .sort((a, b) => {
                    const aHasEmpties = Boolean(String(a.empties_type ?? "").trim() || String(a.name ?? "").toLowerCase().includes("empties"));
                    const bHasEmpties = Boolean(String(b.empties_type ?? "").trim() || String(b.name ?? "").toLowerCase().includes("empties"));
                    if (aHasEmpties && !bHasEmpties) return -1;
                    if (!aHasEmpties && bHasEmpties) return 1;
                    return 0;
                  });
                const promoRow = isPromoLine(line);
                const displayName = promoRow ? line.item_name : line.item_name;
                return (
                  <tr
                    key={line.key}
                    className={`${idx % 2 === 0 ? "bg-background" : "bg-muted/20"} ${promoRow ? "bg-green-50/60" : ""}`}
                  >
                    <td className="border-b border-r border-border px-2 py-1 text-muted-foreground">{idx + 1}</td>
                    <td className="border-b border-r border-border px-1 py-0.5">
                      <div className="relative">
                        <input
                          id={`item-code-${idx}`}
                          value={line.item_code}
                          onChange={(e) => {
                            if (promoRow) return;
                            updateLine(idx, { item_code: e.target.value });
                            setLineDropdown({ row: idx, field: "code" });
                          }}
                          onFocus={() => !promoRow && setLineDropdown({ row: idx, field: "code" })}
                          onBlur={() =>
                            setTimeout(() => {
                              if (lineDropdown?.row === idx && lineDropdown?.field === "code")
                                resolveProduct(idx, line.item_code, "code");
                              setLineDropdown((p) => (p?.row === idx && p?.field === "code" ? null : p));
                            }, 120)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && codeMatches.length > 0 && !promoRow) {
                              e.preventDefault();
                              applyProductToRow(idx, codeMatches[0], true);
                            }
                          }}
                          className={`h-7 w-full rounded-none border-0 px-2 text-sm outline-none ${promoRow ? "bg-transparent" : "bg-transparent focus:bg-background focus:ring-1 focus:ring-inset focus:ring-border"}`}
                          placeholder="Code"
                          readOnly={promoRow}
                        />
                        {!promoRow && lineDropdown?.row === idx && lineDropdown?.field === "code" && codeMatches.length > 0 && (
                          <div className="absolute left-0 top-full z-50 mt-0.5 max-h-48 min-w-[16rem] overflow-auto rounded border border-border bg-background shadow-xl">
                            {codeMatches.slice(0, 20).map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="w-full px-2 py-2 text-left text-sm hover:bg-muted/80"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => applyProductToRow(idx, p, true)}
                              >
                                {(p.code ? `${p.code} - ` : "") + p.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="min-w-0 border-b border-r border-border px-1 py-0.5" style={{ maxWidth: 200 }}>
                      <div className="relative flex min-w-0 items-center gap-1.5">
                        {promoRow && (
                          <span className="shrink-0 rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            FREE
                          </span>
                        )}
                        <input
                          value={displayName}
                          onChange={(e) => {
                            if (promoRow) return;
                            updateLine(idx, { item_name: e.target.value });
                            setLineDropdown({ row: idx, field: "name" });
                          }}
                          onFocus={() => !promoRow && setLineDropdown({ row: idx, field: "name" })}
                          onBlur={() =>
                            setTimeout(() => {
                              if (lineDropdown?.row === idx && lineDropdown?.field === "name")
                                resolveProduct(idx, line.item_name, "name");
                              setLineDropdown((p) => (p?.row === idx && p?.field === "name" ? null : p));
                            }, 120)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && nameMatches.length > 0 && !promoRow) {
                              e.preventDefault();
                              applyProductToRow(idx, nameMatches[0], true);
                            }
                          }}
                          className={`h-7 min-w-0 flex-1 truncate rounded-none border-0 px-2 text-sm outline-none ${promoRow ? "bg-transparent" : "bg-transparent focus:bg-background focus:ring-1 focus:ring-inset focus:ring-border"}`}
                          placeholder="Item name"
                          readOnly={promoRow}
                          title={displayName}
                        />
                        {!promoRow && lineDropdown?.row === idx && lineDropdown?.field === "name" && nameMatches.length > 0 && (
                          <div className="absolute left-0 top-full z-50 mt-0.5 max-h-48 min-w-[20rem] overflow-auto rounded border border-border bg-background shadow-xl">
                            {nameMatches.slice(0, 20).map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="w-full px-2 py-2 text-left text-sm hover:bg-muted/80"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => applyProductToRow(idx, p, true)}
                              >
                                {(p.code ? `${p.code} - ` : "") + p.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="border-b border-r border-border px-2 py-1 text-sm">
                      {priceTypes.find((pt) => pt.name === line.price_type)?.name ?? "Retail Price"}
                    </td>
                    <td className="border-b border-r border-border px-2 py-0.5 text-right">
                      <input
                        value={line.pack_unit}
                        onChange={(e) => !promoRow && updateLine(idx, { pack_unit: e.target.value })}
                        onBlur={(e) => {
                          if (promoRow) return;
                          const v = e.target.value;
                          if (v) updateLine(idx, { pack_unit: fmtInt(v) });
                        }}
                        className="h-7 w-full rounded-none border-0 bg-transparent px-2 text-right text-sm outline-none tabular-nums"
                        placeholder="0"
                        readOnly={promoRow}
                        inputMode="numeric"
                      />
                    </td>
                    <td className="border-b border-r border-border px-2 py-0.5 text-right">
                      <input
                        value={line.btl_qty}
                        onChange={(e) => {
                          if (promoRow) return;
                          const v = e.target.value;
                          updateLine(idx, { btl_qty: v, ctn_qty: v.trim() ? "" : line.ctn_qty });
                        }}
                        onBlur={(e) => {
                          if (promoRow) return;
                          const v = e.target.value;
                          if (v) updateLine(idx, { btl_qty: fmtInt(v) });
                        }}
                        className="h-7 w-full rounded-none border-0 bg-transparent px-2 text-right text-sm outline-none tabular-nums"
                        placeholder="0"
                        readOnly={promoRow}
                        inputMode="numeric"
                      />
                    </td>
                    <td className="border-b border-r border-border px-2 py-0.5 text-right">
                      <input
                        id={`ctn-qty-${idx}`}
                        value={n(line.btl_qty) !== 0 ? "" : line.ctn_qty}
                        onChange={(e) => {
                          if (promoRow) return;
                          const v = e.target.value;
                          updateLine(idx, { ctn_qty: v, btl_qty: v.trim() ? "" : line.btl_qty });
                        }}
                        onBlur={(e) => {
                          if (promoRow) return;
                          const v = e.target.value;
                          if (v.trim()) updateLine(idx, { ctn_qty: fmtNum(n(v), 2) });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !promoRow) {
                            e.preventDefault();
                            setTimeout(() => document.getElementById(`item-code-${idx + 1}`)?.focus(), 0);
                          }
                        }}
                        className="h-7 w-full rounded-none border-0 bg-transparent px-2 text-right text-sm outline-none tabular-nums"
                        placeholder="0"
                        readOnly={promoRow}
                      />
                    </td>
                    <td className="border-b border-r border-border px-2 py-0.5 text-right">
                      <input
                        value={line.price_tax_inc}
                        onChange={(e) => !promoRow && updateLine(idx, { price_tax_inc: e.target.value })}
                        onBlur={(e) => {
                          if (promoRow) return;
                          const v = n(e.target.value);
                          if (e.target.value.trim()) updateLine(idx, { price_tax_inc: fmtNum(v, 2) });
                        }}
                        className="h-7 w-full rounded-none border-0 bg-transparent px-2 text-right text-sm outline-none tabular-nums"
                        placeholder="0"
                        readOnly={promoRow}
                      />
                    </td>
                    <td className={`border-b border-r border-border px-2 py-1 text-right font-medium tabular-nums ${n(line.value_tax_inc) < 0 ? "text-destructive" : ""}`}>
                      {line.value_tax_inc || "0"}
                    </td>
                    <td className="border-b border-border px-1 py-1 text-center">
                      {!promoRow && (
                        <button
                          type="button"
                          onClick={() => deleteLine(idx)}
                          className="rounded p-1 text-destructive hover:bg-destructive/10"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-medium">
                <td colSpan={5} className="border-r border-border px-2 py-2 text-right"></td>
                <td className="border-r border-border px-2 py-2 text-right"></td>
                <td className="border-r border-border px-2 py-2 text-right">{totals.ctn_qty}</td>
                <td className="border-r border-border px-2 py-2 text-right"></td>
                <td className={`border-r border-border px-2 py-2 text-right tabular-nums ${grandTotalNum < 0 ? "text-destructive font-semibold" : ""}`}>
                  {fmtNum(grandTotalNum, 2)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-3 rounded border border-border bg-muted/10 px-3 py-2">
          <div className="mb-2 flex items-center gap-1.5">
            <Package className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="font-medium">Empties — Expected &amp; Received</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-auto min-w-[28rem] table-fixed border border-border text-sm">
            <thead>
              <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 12%, white)" }}>
                <th className="border-b border-r border-border px-2 py-1.5 text-left font-medium" style={{ color: "var(--navbar)", width: "14rem" }}>
                  PRODUCT
                </th>
                <th className="border-b border-r border-border px-2 py-1.5 text-right font-medium" style={{ color: "var(--navbar)", width: "6rem" }}>
                  EXP
                </th>
                <th className="border-b border-r border-border px-2 py-1.5 text-right font-medium" style={{ color: "var(--navbar)", width: "6rem" }}>
                  RCVD
                </th>
                <th className="border-b border-border px-2 py-1.5 text-right font-medium" style={{ color: "var(--navbar)", width: "6rem" }}>
                  O/S
                </th>
              </tr>
            </thead>
            <tbody>
              {emptiesTableRows.length === 0 ? (
                <tr className="bg-background">
                  <td colSpan={4} className="border-b border-border px-2 py-2 text-center text-muted-foreground">
                    No returnable line items to show.
                  </td>
                </tr>
              ) : (
                emptiesTableRows.map((row, i) => {
                  const rcvd = n(emptiesRcvd[row.emptiesType] ?? "");
                  const osCtn = Math.max(0, row.expCtn - rcvd);
                  return (
                    <tr key={`empties-${row.emptiesType}-${i}`} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      <td className="border-b border-r border-border px-2 py-1.5">{row.emptiesType}</td>
                      <td className="border-b border-r border-border px-2 py-1.5 text-right tabular-nums">{row.expCtn ? fmt(row.expCtn, 0) : "—"}</td>
                      <td className="border-b border-r border-border px-1 py-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={emptiesRcvd[row.emptiesType] ?? ""}
                          onChange={(e) => updateEmptiesRcvd(row.emptiesType, e.target.value)}
                          className="h-7 w-full rounded border border-input bg-background px-2 text-right text-sm tabular-nums outline-none focus:ring-1 focus:ring-ring"
                          placeholder="0"
                        />
                      </td>
                      <td className={`border-b border-border px-2 py-1.5 text-right tabular-nums font-medium ${osCtn > 0 ? "text-destructive" : ""}`}>
                        {osCtn > 0 ? fmt(osCtn, 0) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:gap-6">
          <div className="rounded-lg border border-border bg-muted/20 px-6 py-4">
            <p className="text-sm text-muted-foreground">Subtotal</p>
            <p className="text-lg font-semibold">{fmtMoney(totals.sub_total)}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-6 py-4">
            <p className="text-sm text-muted-foreground">VAT</p>
            <p className="text-lg font-semibold">{fmtMoney(totals.vat)}</p>
          </div>
          {emptiesDepositValue !== 0 && (
            <div className="rounded-lg border border-border bg-muted/20 px-6 py-4">
              <p className="text-sm text-muted-foreground">
                {emptiesDepositValue > 0 ? "Empties Deposit" : "Empties Refund"}
              </p>
              <p className={`text-lg font-semibold ${emptiesDepositValue < 0 ? "text-destructive" : ""}`}>
                {fmtMoney(emptiesDepositValue)}
              </p>
            </div>
          )}
          <div
            className="rounded-lg border-2 px-6 py-4"
            style={{ borderColor: "var(--navbar)", backgroundColor: "color-mix(in oklch, var(--navbar) 8%, white)" }}
          >
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold" style={{ color: "var(--navbar)" }}>
              {fmtMoney(grandTotalNum)}
            </p>
          </div>
        </div>
      </div>

      <aside className="w-full shrink-0 space-y-4 xl:w-[32rem] xl:min-w-[32rem]">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-baseline gap-2">
              <h3 className="font-semibold">Daily Performance</h3>
              <span className="text-sm text-muted-foreground">{saleDate}</span>
            </div>
            {salesRepId ? (
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${
                  dailyAchievementPct >= 100
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <TrendingUp className="mr-0.5 inline h-3 w-3" />
                {dailyAchievementPct.toFixed(1)}%
              </span>
            ) : null}
          </div>

          {!salesRepId ? (
            <p className="mt-4 text-sm text-muted-foreground">Select a sales rep to view daily performance.</p>
          ) : (
            <>
              <div className="mt-3">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">Today&apos;s Sales</span>
                  <span className="text-muted-foreground">Target: {fmtMoney(dailyTarget)}</span>
                </div>
                <p className={`mt-0.5 text-xl font-bold tabular-nums ${targetReached ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                  {fmtMoney(todaySales)}
                </p>
                {todayInvoiceCount > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {todayInvoiceCount} sale{todayInvoiceCount !== 1 ? "s" : ""}
                  </p>
                )}
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      targetReached ? "bg-emerald-600" : "bg-muted-foreground/50"
                    }`}
                    style={{
                      width: `${dailyTarget > 0 ? Math.min(100, (todaySales / dailyTarget) * 100) : 0}%`,
                    }}
                  />
                </div>
                <p
                  className={`mt-1.5 text-sm ${targetReached ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground"}`}
                >
                  {targetReached
                    ? "✓ Daily target reached — commission earned today!"
                    : `${fmtMoney(Math.max(0, dailyTarget - todaySales))} remaining to earn today's commission.`}
                </p>
              </div>

              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Commission ({(commissionPct * 100).toFixed(1)}%) — Daily Achievement
              </p>
              <div
                className="mt-2 flex flex-nowrap items-center gap-2 rounded-md border border-amber-300 bg-amber-100 px-3 py-2 dark:border-amber-700 dark:bg-amber-950/50"
              >
                <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-500" />
                <p className="whitespace-nowrap text-xs text-muted-foreground">
                  Earned only on days where sales ≥ {fmtMoney(dailyTarget)} — {qualifyingDays} day{qualifyingDays !== 1 ? "s" : ""} qualified
                </p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div
                  className={`rounded border px-2 py-2 text-center ${
                    targetReached
                      ? "border-emerald-400 bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-950/50"
                      : "border-amber-400 bg-amber-100 dark:border-amber-600 dark:bg-amber-950/50"
                  }`}
                >
                  <p className="text-[10px] font-medium uppercase text-muted-foreground">
                    {targetReached ? "Today ✓" : "At Stake"}
                  </p>
                  <p
                    className={`font-semibold tabular-nums ${
                      targetReached
                        ? "text-emerald-800 dark:text-emerald-200"
                        : "text-amber-900 dark:text-amber-100"
                    }`}
                  >
                    {fmtMoney(targetReached ? todayCommission : dailyTarget * commissionPct)}
                  </p>
                </div>
                <div className="rounded border border-emerald-400 bg-emerald-100 px-2 py-2 text-center dark:border-emerald-600 dark:bg-emerald-950/50">
                  <p className="text-[10px] font-medium uppercase text-muted-foreground">MTD</p>
                  <p className="font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
                    {fmtMoney(mtdCommission)}
                  </p>
                </div>
                <div className="rounded border border-red-400 bg-red-100 px-2 py-2 text-center dark:border-red-600 dark:bg-red-950/50">
                  <p className="text-[10px] font-medium uppercase text-muted-foreground">At Risk</p>
                  <p className="font-semibold tabular-nums text-red-800 dark:text-red-200">
                    {fmtMoney(atRisk)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold">Active Promotions</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {promotions.length === 0 ? (
              <li className="text-muted-foreground">No active promotions</li>
            ) : (
              promotions.slice(0, 5).map((p) => (
                <li key={p.id} className="border-l-2 border-amber-400 pl-2">
                  {p.name}
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold">Parked Sales</h3>
          <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
            {parkedFromStorage.length === 0 ? (
              <li className="text-sm text-muted-foreground">No parked sales</li>
            ) : (
              parkedFromStorage.map((ps) => (
                <li
                  key={ps.id}
                  className="flex items-center justify-between gap-2 rounded border border-border bg-muted/20 p-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{ps.receipt_no}</p>
                    <p className="text-muted-foreground truncate">
                      {ps.customer_name} • {ps.location_name} • {ps.parkedAt}
                    </p>
                    <p className={`font-semibold ${(ps.total as number) < 0 ? "text-destructive" : ""}`}>{fmtMoney(ps.total)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      style={{ backgroundColor: "var(--navbar)", color: "white" }}
                      className="touch-manipulation border-transparent"
                      onClick={() => {
                        const p = ps.payload as { saleDate?: string; customerId?: string; locationId?: string; salesRepId?: string; notes?: string; lines?: Line[]; emptiesRcvd?: Record<string, string> };
                        if (p.saleDate) setSaleDate(p.saleDate);
                        if (p.customerId) setCustomerId(p.customerId);
                        if (p.locationId) setLocationId(p.locationId);
                        if (p.salesRepId) setSalesRepId(p.salesRepId);
                        if (p.notes) setNotes(p.notes);
                        if (p.lines?.length) {
                          const last = p.lines[p.lines.length - 1];
                          const withBlank = hasLineData(last) ? [...p.lines, blankLine(String(p.lines.length), defaultPriceType)] : p.lines;
                          setLines(withBlank.map((l, i) => ({ ...l, key: String(i) })));
                        }
                        if (p.emptiesRcvd) setEmptiesRcvd(p.emptiesRcvd);
                        try {
                          localStorage.removeItem(ps.id);
                          refreshParked();
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      Resume
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="touch-manipulation text-destructive"
                      onClick={() => {
                        if (!confirm("Delete this parked sale?")) return;
                        try {
                          localStorage.removeItem(ps.id);
                          refreshParked();
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </aside>

      <Dialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        title="Take Payment"
        subtitle={`Total: ${fmtMoney(grandTotalNum)}`}
        showGearIcon={false}
        contentClassName="max-w-2xl"
      >
        <PaymentDialogContent
          total={grandTotalNum}
          paymentAccounts={paymentAccounts}
          paymentMethods={paymentMethods}
          onComplete={async (amountPaid, paymentMethod, paymentAccountId) => {
            try {
              const saleLines = lines.filter((l) => hasLineData(l));
            const receiptLines: ReceiptLineItem[] = [];
            for (const line of saleLines) {
              const product = line.product_id ? productLookup.byId.get(line.product_id) : undefined;
              if (isEmptiesProduct(product)) continue;
              const ctnQty = n(line.ctn_qty);
              const btlQty = n(line.btl_qty);
              const price = n(line.price_tax_inc);
              const lineAmount = n(line.value_tax_inc);
              const itemName = line.item_name || "—";
              const pack = Math.max(1, n(line.pack_unit));
              if (ctnQty !== 0 && btlQty !== 0) {
                receiptLines.push({ item: itemName, unit: "Btl", qty: btlQty, price, amount: lineAmount });
              } else if (ctnQty !== 0) {
                receiptLines.push({ item: itemName, unit: "Ctn", qty: ctnQty, price, amount: lineAmount });
              } else if (btlQty !== 0) {
                receiptLines.push({ item: itemName, unit: "Btl", qty: btlQty, price, amount: lineAmount });
              } else {
                receiptLines.push({ item: itemName, unit: "Ctn", qty: 0, price, amount: lineAmount });
              }
            }

            const emptiesReceived: ReceiptEmptiesReceived[] = Object.entries(emptiesRcvd)
              .filter(([, v]) => v && n(v) !== 0)
              .map(([emptiesType, v]) => ({ emptiesType, qtyCtn: n(v) }));

            const emptiesRcvdNum: Record<string, number> = {};
            for (const [k, v] of Object.entries(emptiesRcvd)) {
              const val = n(v);
              if (val !== 0) emptiesRcvdNum[k] = val;
            }

            const result = await savePosSale({
              saleDate,
              customerId,
              locationId,
              salesRepId,
              notes,
              lines: saleLines.map((l) => ({
                product_id: l.product_id,
                item_code: l.item_code,
                item_name: l.item_name,
                price_type: l.price_type,
                pack_unit: l.pack_unit,
                btl_qty: l.btl_qty,
                ctn_qty: l.ctn_qty,
                price_tax_inc: l.price_tax_inc,
                tax_rate: l.tax_rate,
                value_tax_inc: l.value_tax_inc,
                isPromo: l.isPromo,
              })),
              subTotal: totals.sub_total,
              vatTotal: totals.vat,
              grandTotal: totals.grand_total,
              emptiesDeposit: emptiesDepositValue,
              emptiesRcvd: emptiesRcvdNum,
              paymentMethod: paymentMethod ?? "cash",
              amountPaid,
              paymentAccountId: paymentAccountId ?? null,
            });

            if (result?.error) {
              throw new Error(result.error);
            }

            if (salesRepId?.trim() && saleDate) {
              const monthKey = saleDate.slice(0, 7);
              getPosPerformance(monthKey, salesRepId.trim(), saleDate).then((res) => {
                const rep = res.reps[0];
                if (!rep) return;
                const todaySales = rep.salesByDay[saleDate] ?? 0;
                const todayCommission =
                  rep.dailyTarget > 0 && todaySales >= rep.dailyTarget
                    ? todaySales * (rep.commissionPct / 100)
                    : 0;
                setDailyPerf({
                  todaySales,
                  todayInvoiceCount: rep.todayInvoiceCount ?? 0,
                  dailyTarget: rep.dailyTarget,
                  commissionPct: rep.commissionPct,
                  todayCommission,
                  mtdCommission: rep.commissionEarned,
                  qualifyingDays: rep.qualifyingDays,
                  atRisk: rep.commissionAtRisk,
                  achievementPct: rep.achievementPct,
                });
              });
            }

            const invNo = result?.invoice_no ?? "";

            const dateObj = saleDate ? new Date(saleDate + "T12:00:00") : new Date();
            const dateStr =
              dateObj.getDate().toString().padStart(2, "0") +
              "-" +
              ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dateObj.getMonth()] +
              "-" +
              dateObj.getFullYear().toString().slice(-2);
            const now = new Date();
            const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });

            const loc = locations.find((l) => l.id === locationId);
            const locationName = loc?.name ?? "—";
            const locationPhone = loc?.phone ?? undefined;
            const salesRepName = salesReps.find((r) => r.id === salesRepId)?.name ?? "—";

            setReceiptData({
              companyName: orgName || "Company",
              locationName,
              locationPhone: locationPhone || undefined,
              orgPhone: orgPhone || undefined,
              invNo,
              cashier: cashier,
              salesRep: salesRepName,
              date: dateStr,
              time: timeStr,
              lines: receiptLines,
              netTotal: totals.sub_total,
              vatRate: totals.sub_total > 0 ? (totals.vat / totals.sub_total) * 100 : 0,
              vatAmount: totals.vat,
              total: totals.grand_total,
              emptiesDeposit: emptiesDepositValue,
              grandTotal: totals.grand_total + emptiesDepositValue,
              amountPaid,
              change: amountPaid - (totals.grand_total + emptiesDepositValue),
              emptiesReceived,
            });

            setPaymentOpen(false);
            setLines([blankLine("0", defaultPriceType)]);
            setEmptiesRcvd({});
            setReceiptOpen(true);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              alert(msg || "Payment failed. Please try again.");
            }
          }}
          onCancel={() => setPaymentOpen(false)}
        />
      </Dialog>

      <ReceiptPrintModal
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        data={receiptData}
      />
    </div>
  );
}
