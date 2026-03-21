"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Gift } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { savePromotion } from "@/app/dashboard/sales/promotions/actions";

type Product = {
  id: string;
  code: string | null;
  name: string;
  unit?: string | null;
  pack_unit?: number | null;
  is_active?: boolean | null;
};

type LookupItem = {
  id: string;
  code?: string | null;
  name: string;
};

export type Promotion = {
  id: string;
  promo_code: string;
  name: string;
  promo_budget_cartons: number | null;
  consumed_cartons: number | null;
  start_date: string;
  end_date: string;
  description: string | null;
  is_active: boolean | null;
  eligible_price_types: string[] | null;
  eligible_location_ids: string[] | null;
  days_of_week: number[] | null;
  happy_hour_start: string | null;
  happy_hour_end: string | null;
};

export type PromotionRule = {
  id: string;
  promotion_id: string;
  buy_product_id: string;
  buy_qty: number;
  buy_unit: string | null;
  reward_product_id: string;
  reward_qty: number;
  reward_unit: string | null;
  row_no: number | null;
};

type RuleRow = {
  buyProductId: string;
  buyQuery: string;
  buyQty: string;
  buyUnit: "cartons" | "bottles";
  rewardProductId: string;
  rewardQuery: string;
  rewardQty: string;
  rewardUnit: "cartons" | "bottles";
};

function emptyRule(): RuleRow {
  return {
    buyProductId: "",
    buyQuery: "",
    buyQty: "",
    buyUnit: "cartons",
    rewardProductId: "",
    rewardQuery: "",
    rewardQty: "",
    rewardUnit: "cartons",
  };
}

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

function formatProductLabel(product: Product) {
  const code = String(product.code ?? "").trim();
  return code ? `${code} - ${product.name}` : product.name;
}

function parseTimeForInput(value: string | null | undefined) {
  if (!value) return "";
  const bits = String(value).split(":");
  if (bits.length < 2) return "";
  return `${bits[0]}:${bits[1]}`;
}

function findProductByQuery(query: string, products: Product[]) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    products.find((product) => {
      const code = String(product.code ?? "").toLowerCase();
      return code === q;
    }) ??
    products.find((product) => product.name.toLowerCase() === q) ??
    products.find((product) => formatProductLabel(product).toLowerCase() === q) ??
    null
  );
}

export function PromotionFormDialog({
  open,
  onOpenChange,
  onSaved,
  products,
  priceTypes,
  locations,
  initialPromotion,
  initialRules,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  products: Product[];
  priceTypes: LookupItem[];
  locations: LookupItem[];
  initialPromotion: Promotion | null;
  initialRules: PromotionRule[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const productById = useMemo(() => {
    return new Map(products.map((p) => [String(p.id), p]));
  }, [products]);

  const [promoCode, setPromoCode] = useState("");
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [eligiblePriceTypes, setEligiblePriceTypes] = useState<string[]>([]);
  const [eligibleLocationIds, setEligibleLocationIds] = useState<string[]>([]);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [happyHourStart, setHappyHourStart] = useState("");
  const [happyHourEnd, setHappyHourEnd] = useState("");
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [activeRuleDropdown, setActiveRuleDropdown] = useState<"buy" | "reward" | null>(null);

  useEffect(() => {
    if (!open) return;

    setPromoCode(initialPromotion?.promo_code ?? "");
    setName(initialPromotion?.name ?? "");
    setBudget(
      initialPromotion?.promo_budget_cartons == null ? "" : String(initialPromotion.promo_budget_cartons)
    );
    setStartDate(initialPromotion?.start_date ?? new Date().toISOString().slice(0, 10));
    setEndDate(initialPromotion?.end_date ?? new Date().toISOString().slice(0, 10));
    setDescription(initialPromotion?.description ?? "");
    setIsActive(initialPromotion?.is_active !== false);
    setEligiblePriceTypes(initialPromotion?.eligible_price_types ?? []);
    setEligibleLocationIds((initialPromotion?.eligible_location_ids ?? []).map(String));
    setDaysOfWeek((initialPromotion?.days_of_week ?? []).map(Number).filter((d) => d >= 0 && d <= 6));
    setHappyHourStart(parseTimeForInput(initialPromotion?.happy_hour_start));
    setHappyHourEnd(parseTimeForInput(initialPromotion?.happy_hour_end));

    const seededRules = (initialRules ?? []).map((rule) => {
      const buy = productById.get(String(rule.buy_product_id));
      const reward = productById.get(String(rule.reward_product_id));
      return {
        buyProductId: String(rule.buy_product_id),
        buyQuery: buy ? formatProductLabel(buy) : "",
        buyQty: String(rule.buy_qty ?? ""),
        buyUnit: rule.buy_unit === "bottles" ? "bottles" : "cartons",
        rewardProductId: String(rule.reward_product_id),
        rewardQuery: reward ? formatProductLabel(reward) : "",
        rewardQty: String(rule.reward_qty ?? ""),
        rewardUnit: rule.reward_unit === "bottles" ? "bottles" : "cartons",
      } as RuleRow;
    });

    setRules(
      seededRules.length > 0
        ? [seededRules[0]]
        : [emptyRule()]
    );
    setError(null);
  }, [open, initialPromotion, initialRules, productById]);

  const toggleTextSelection = (current: string[], value: string) => {
    if (current.includes(value)) return current.filter((x) => x !== value);
    return [...current, value];
  };

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((x) => x !== day) : [...prev, day]));
  };

  const filteredBuyProducts = useMemo(() => {
    const q = String(rules[0]?.buyQuery ?? "").toLowerCase().trim();
    if (!q) return products.slice(0, 30);
    return products
      .filter((p) => formatProductLabel(p).toLowerCase().includes(q))
      .slice(0, 30);
  }, [products, rules]);

  const filteredRewardProducts = useMemo(() => {
    const q = String(rules[0]?.rewardQuery ?? "").toLowerCase().trim();
    if (!q) return products.slice(0, 30);
    return products
      .filter((p) => formatProductLabel(p).toLowerCase().includes(q))
      .slice(0, 30);
  }, [products, rules]);

  const applyRuleProduct = (field: "buy" | "reward", product: Product) => {
    setRules((prev) => {
      const row = prev[0] ?? emptyRule();
      if (field === "buy") {
        return [{ ...row, buyProductId: String(product.id), buyQuery: formatProductLabel(product) }];
      }
      return [{ ...row, rewardProductId: String(product.id), rewardQuery: formatProductLabel(product) }];
    });
    setActiveRuleDropdown(null);
  };

  const handleRuleQueryCommit = (index: number, field: "buy" | "reward") => {
    setRules((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const query = field === "buy" ? row.buyQuery : row.rewardQuery;
        const matched = findProductByQuery(query, products);
        if (!matched) return row;
        if (field === "buy") {
          return {
            ...row,
            buyProductId: String(matched.id),
            buyQuery: formatProductLabel(matched),
          };
        }
        return {
          ...row,
          rewardProductId: String(matched.id),
          rewardQuery: formatProductLabel(matched),
        };
      })
    );
  };

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      if (initialPromotion?.id) form.set("id", initialPromotion.id);
      form.set("promo_code", promoCode);
      form.set("name", name);
      form.set("promo_budget_cartons", budget);
      form.set("start_date", startDate);
      form.set("end_date", endDate);
      form.set("description", description);
      form.set("is_active", String(isActive));
      form.set("eligible_price_types", eligiblePriceTypes.join(","));
      form.set("eligible_location_ids", eligibleLocationIds.join(","));
      form.set("days_of_week", daysOfWeek.sort((a, b) => a - b).join(","));
      form.set("happy_hour_start", happyHourStart);
      form.set("happy_hour_end", happyHourEnd);

      rules.slice(0, 1).forEach((rule, idx) => {
        form.set(`rule_buy_product_id_${idx}`, rule.buyProductId);
        form.set(`rule_buy_qty_${idx}`, rule.buyQty);
        form.set(`rule_buy_unit_${idx}`, rule.buyUnit);
        form.set(`rule_reward_product_id_${idx}`, rule.rewardProductId);
        form.set(`rule_reward_qty_${idx}`, rule.rewardQty);
        form.set(`rule_reward_unit_${idx}`, rule.rewardUnit);
      });

      const result = await savePromotion(form);
      if (result?.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      onSaved();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialPromotion ? "Edit Promotion" : "New Promotion"}
      showGearIcon={false}
      contentClassName="max-w-[1120px]"
      bodyClassName="max-h-[78vh] overflow-y-auto p-4"
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Promotions auto-apply in Sales Invoice entry.</p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium">Promo Code *</label>
            <input
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              className="h-9 w-full rounded border border-input bg-background px-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-full rounded border border-input bg-background px-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium">
              Promo Budget (Cartons) — Optional (blank = unlimited)
            </label>
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Optional"
              className="h-9 w-full rounded border border-input bg-background px-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Consumed so far: {Number(initialPromotion?.consumed_cartons ?? 0).toFixed(4)} cartons
            </p>
          </div>
          <div className="rounded border border-border p-2">
            <label className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Gift className="h-4 w-4" />
              Buy Product A → Get Product B
            </label>
            <p className="text-xs text-muted-foreground">One rule per promo.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium">Start Date *</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 w-full rounded border border-input bg-background px-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">End Date *</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 w-full rounded border border-input bg-background px-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">Description (Optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Active
        </label>

        <div className="border-t border-border pt-3">
          <h3 className="text-sm font-semibold">Eligibility (Optional)</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Leave blank to apply to everyone / every day.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium">Customer Groups (Price Types)</label>
            <div className="flex min-h-10 flex-wrap gap-1 rounded border border-input p-1.5">
              {priceTypes.map((item) => {
                const selected = eligiblePriceTypes.includes(item.name);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setEligiblePriceTypes((prev) => toggleTextSelection(prev, item.name))}
                    className={`rounded border px-2 py-0.5 text-xs ${
                      selected ? "border-[var(--navbar)] bg-[var(--navbar)] text-white" : "border-border bg-muted/30"
                    }`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Locations — Leave blank for all locations</label>
            <div className="flex min-h-10 flex-wrap gap-1 rounded border border-input p-1.5">
              {locations.map((item) => {
                const key = String(item.id);
                const selected = eligibleLocationIds.includes(key);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setEligibleLocationIds((prev) => toggleTextSelection(prev, key))}
                    className={`rounded border px-2 py-0.5 text-xs ${
                      selected ? "border-[var(--navbar)] bg-[var(--navbar)] text-white" : "border-border bg-muted/30"
                    }`}
                  >
                    {(item.code ?? item.id)} - {item.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium">Days of week</label>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={`rounded border px-2 py-0.5 text-xs ${
                    daysOfWeek.includes(day.value)
                      ? "border-[var(--navbar)] bg-[var(--navbar)] text-white"
                      : "border-border bg-muted/30"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Happy Hour Start | Happy Hour End</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="time"
                value={happyHourStart}
                onChange={(e) => setHappyHourStart(e.target.value)}
                className="h-9 rounded border border-input bg-background px-2 text-sm"
              />
              <input
                type="time"
                value={happyHourEnd}
                onChange={(e) => setHappyHourEnd(e.target.value)}
                className="h-9 rounded border border-input bg-background px-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Rule</h3>
              <p className="text-xs text-muted-foreground">
                One promo uses one rule: Buy Product A → Get Product B.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setRules([emptyRule()])}>
              Clear Rule
            </Button>
          </div>

          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full min-w-[760px] table-fixed text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="border-b border-r border-border px-2 py-1.5 text-left" style={{ width: 240 }}>Buy Product</th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-right" style={{ width: 90 }}>Qty (Buy)</th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-left" style={{ width: 90 }}>Unit</th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-left" style={{ width: 240 }}>Reward Product</th>
                  <th className="border-b border-r border-border px-2 py-1.5 text-right" style={{ width: 90 }}>Qty (Reward)</th>
                  <th className="border-b border-border px-2 py-1.5 text-left" style={{ width: 90 }}>Unit</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-background">
                  <td className="border-b border-r border-border p-1">
                    <div className="relative">
                    <input
                      value={rules[0]?.buyQuery ?? ""}
                      onChange={(e) =>
                        setRules((prev) => [{ ...(prev[0] ?? emptyRule()), buyQuery: e.target.value, buyProductId: "" }])
                      }
                      onFocus={() => setActiveRuleDropdown("buy")}
                      onBlur={() => {
                        handleRuleQueryCommit(0, "buy");
                        setTimeout(() => setActiveRuleDropdown((cur) => (cur === "buy" ? null : cur)), 120);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        if (filteredBuyProducts.length === 0) return;
                        e.preventDefault();
                        applyRuleProduct("buy", filteredBuyProducts[0]);
                      }}
                      className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                    />
                    {activeRuleDropdown === "buy" && filteredBuyProducts.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-[80] mt-0.5 max-h-52 overflow-auto rounded border border-border bg-background shadow-xl">
                        {filteredBuyProducts.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            className="w-full whitespace-nowrap px-2.5 py-2 text-left text-sm font-medium hover:bg-muted/80"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyRuleProduct("buy", product)}
                          >
                            {formatProductLabel(product)}
                          </button>
                        ))}
                      </div>
                    )}
                    </div>
                  </td>
                  <td className="border-b border-r border-border p-1">
                    <input
                      value={rules[0]?.buyQty ?? ""}
                      onChange={(e) =>
                        setRules((prev) => [{ ...(prev[0] ?? emptyRule()), buyQty: e.target.value }])
                      }
                      className="h-8 w-full rounded border border-input bg-background px-2 text-right text-sm"
                    />
                  </td>
                  <td className="border-b border-r border-border p-1">
                    <select
                      value={rules[0]?.buyUnit ?? "cartons"}
                      onChange={(e) =>
                        setRules((prev) => [
                          {
                            ...(prev[0] ?? emptyRule()),
                            buyUnit: e.target.value === "bottles" ? "bottles" : "cartons",
                          },
                        ])
                      }
                      className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                    >
                      <option value="cartons">Cartons</option>
                      <option value="bottles">Bottles</option>
                    </select>
                  </td>
                  <td className="border-b border-r border-border p-1">
                    <div className="relative">
                    <input
                      value={rules[0]?.rewardQuery ?? ""}
                      onChange={(e) =>
                        setRules((prev) => [{ ...(prev[0] ?? emptyRule()), rewardQuery: e.target.value, rewardProductId: "" }])
                      }
                      onFocus={() => setActiveRuleDropdown("reward")}
                      onBlur={() => {
                        handleRuleQueryCommit(0, "reward");
                        setTimeout(() => setActiveRuleDropdown((cur) => (cur === "reward" ? null : cur)), 120);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        if (filteredRewardProducts.length === 0) return;
                        e.preventDefault();
                        applyRuleProduct("reward", filteredRewardProducts[0]);
                      }}
                      className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                    />
                    {activeRuleDropdown === "reward" && filteredRewardProducts.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-[80] mt-0.5 max-h-52 overflow-auto rounded border border-border bg-background shadow-xl">
                        {filteredRewardProducts.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            className="w-full whitespace-nowrap px-2.5 py-2 text-left text-sm font-medium hover:bg-muted/80"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyRuleProduct("reward", product)}
                          >
                            {formatProductLabel(product)}
                          </button>
                        ))}
                      </div>
                    )}
                    </div>
                  </td>
                  <td className="border-b border-r border-border p-1">
                    <input
                      value={rules[0]?.rewardQty ?? ""}
                      onChange={(e) =>
                        setRules((prev) => [{ ...(prev[0] ?? emptyRule()), rewardQty: e.target.value }])
                      }
                      className="h-8 w-full rounded border border-input bg-background px-2 text-right text-sm"
                    />
                  </td>
                  <td className="border-b border-border p-1">
                    <select
                      value={rules[0]?.rewardUnit ?? "cartons"}
                      onChange={(e) =>
                        setRules((prev) => [
                          {
                            ...(prev[0] ?? emptyRule()),
                            rewardUnit: e.target.value === "bottles" ? "bottles" : "cartons",
                          },
                        ])
                      }
                      className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                    >
                      <option value="cartons">Cartons</option>
                      <option value="bottles">Bottles</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            className="text-white"
            style={{ backgroundColor: "var(--navbar)" }}
            disabled={pending}
            onClick={handleSave}
          >
            {pending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
