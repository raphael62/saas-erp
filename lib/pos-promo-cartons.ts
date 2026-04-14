/** Shared promo reward carton math for POS park, checkout, and UI budget checks. */

export type PromoCartonLineLike = {
  product_id?: string;
  item_name?: string;
  pack_unit?: string;
  btl_qty?: string;
  ctn_qty?: string;
  isPromo?: boolean;
};

export type PromoRuleRef = {
  promotion_id: string;
  reward_product_id: string | number;
};

function n(v: string | number | null | undefined): number {
  const raw = String(v ?? "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

export function isPromoLineLike(line: PromoCartonLineLike): boolean {
  return Boolean(String(line.item_name ?? "").startsWith("Free - ") || line.isPromo);
}

/** Reward free-product cartons per promotion (matches POS invoice / savePosSale logic). */
export function computePromoRewardCartonsByPromotionId(
  lines: PromoCartonLineLike[],
  rules: PromoRuleRef[]
): Map<string, number> {
  const promoCartonsByPromoId = new Map<string, number>();
  for (const line of lines) {
    if (!isPromoLineLike(line)) continue;
    const productId = String(line.product_id ?? "").trim();
    if (!productId) continue;
    const packUnit = Math.max(1, n(line.pack_unit));
    const btlQty = n(line.btl_qty);
    const ctnQty = n(line.ctn_qty);
    const cartons =
      btlQty !== 0 ? btlQty / packUnit : ctnQty !== 0 ? ctnQty : 0;
    if (cartons <= 0) continue;
    for (const r of rules) {
      if (String(r.reward_product_id) === productId) {
        const promoId = String(r.promotion_id);
        const curr = promoCartonsByPromoId.get(promoId) ?? 0;
        promoCartonsByPromoId.set(promoId, curr + cartons);
      }
    }
  }
  return promoCartonsByPromoId;
}
