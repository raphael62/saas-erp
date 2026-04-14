/**
 * Carton-level stock deductions for POS (matches savePosSale / park reservation logic).
 * Global `products.stock_quantity` and `inventory_location_balances.quantity` are kept in
 * cartons (same as purchase invoices and location transfers), not bottle totals.
 */

export type PosLineStockLike = {
  product_id?: string;
  item_name?: string;
  pack_unit?: string;
  btl_qty?: string;
  ctn_qty?: string;
  isPromo?: boolean;
};

function n(v: string | number | null | undefined): number {
  const raw = String(v ?? "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

export function isPosEmptiesLineName(itemName: string | null | undefined): boolean {
  return String(itemName ?? "").toLowerCase().includes("empties");
}

export function isPosPromoStockLine(line: PosLineStockLike): boolean {
  return Boolean(String(line.item_name ?? "").startsWith("Free - ") || line.isPromo);
}

/** Sum carton qty per product for non-promo, non-empties lines (matches purchase `ctn_qty`). */
export function computePosStockDeductionsByProduct(lines: PosLineStockLike[]): Map<string, number> {
  const productDeductions = new Map<string, number>();
  for (const line of lines) {
    if (isPosPromoStockLine(line) || isPosEmptiesLineName(line.item_name)) continue;
    const productId = String(line.product_id ?? "").trim();
    if (!productId) continue;
    const packUnit = Math.max(1, n(line.pack_unit));
    const btlQty = n(line.btl_qty);
    const ctnQty = n(line.ctn_qty);
    const qty =
      btlQty !== 0 ? btlQty / packUnit : ctnQty !== 0 ? ctnQty : 0;
    if (qty <= 0) continue;
    productDeductions.set(productId, (productDeductions.get(productId) ?? 0) + qty);
  }
  return productDeductions;
}
