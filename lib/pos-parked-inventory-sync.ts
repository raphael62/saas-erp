import type { createClient } from "@/lib/supabase/server";
import { reassignInventoryDeltaFromDefaultLocation } from "@/lib/inventory-location-balances";
import {
  computePosStockDeductionsByProduct,
  type PosLineStockLike,
} from "@/lib/pos-inventory-deductions";

function n(v: string | number | null | undefined): number {
  const raw = String(v ?? "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function isMissingParkedInvDbRelation(err: { message?: string } | null | undefined): boolean {
  return Boolean(err?.message?.toLowerCase().includes("does not exist"));
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function applyPosParkedStockDeduct(
  supabase: Supabase,
  orgId: string,
  locationId: string,
  productId: string,
  bottleQty: number
): Promise<{ error?: string }> {
  if (bottleQty <= 1e-9) return {};
  const { data: bal } = await supabase
    .from("inventory_location_balances")
    .select("quantity")
    .eq("organization_id", orgId)
    .eq("product_id", productId)
    .eq("location_id", locationId)
    .maybeSingle();
  const atLoc = n((bal as { quantity?: number } | null)?.quantity);
  if (atLoc + 1e-9 < bottleQty) {
    return {
      error: `Insufficient stock at this location for one or more lines (available ${atLoc.toFixed(2)} btl, need ${bottleQty.toFixed(2)} more).`,
    };
  }
  const { data: prod } = await supabase
    .from("products")
    .select("stock_quantity")
    .eq("id", productId)
    .eq("organization_id", orgId)
    .maybeSingle();
  const curr = n((prod as { stock_quantity?: number } | null)?.stock_quantity);
  if (curr + 1e-9 < bottleQty) {
    return { error: "Insufficient global stock to park this sale." };
  }
  await supabase
    .from("products")
    .update({ stock_quantity: Math.max(0, curr - bottleQty) })
    .eq("id", productId)
    .eq("organization_id", orgId);
  const loc = await reassignInventoryDeltaFromDefaultLocation(supabase, orgId, productId, -bottleQty, locationId);
  if (loc.error) return loc;
  return {};
}

async function applyPosParkedStockRestore(
  supabase: Supabase,
  orgId: string,
  locationId: string,
  productId: string,
  bottleQty: number
): Promise<{ error?: string }> {
  if (bottleQty <= 1e-9) return {};
  const { data: prod } = await supabase
    .from("products")
    .select("stock_quantity")
    .eq("id", productId)
    .eq("organization_id", orgId)
    .maybeSingle();
  const curr = n((prod as { stock_quantity?: number } | null)?.stock_quantity);
  await supabase
    .from("products")
    .update({ stock_quantity: curr + bottleQty })
    .eq("id", productId)
    .eq("organization_id", orgId);
  const loc = await reassignInventoryDeltaFromDefaultLocation(supabase, orgId, productId, bottleQty, locationId);
  if (loc.error) return loc;
  return {};
}

/** Restore product + location balances for every reservation row (call before deleting the parked cart). */
export async function reversePosParkedInventoryForCartBeforeDelete(
  supabase: Supabase,
  orgId: string,
  cartId: string,
  locationId: string
): Promise<{ error?: string }> {
  const { data: rows, error: selErr } = await supabase
    .from("pos_parked_inventory_reservations")
    .select("product_id, quantity")
    .eq("organization_id", orgId)
    .eq("pos_parked_cart_id", cartId);
  if (selErr) {
    if (isMissingParkedInvDbRelation(selErr)) return {};
    return { error: selErr.message };
  }
  for (const row of rows ?? []) {
    const r = row as { product_id?: string; quantity?: number | string | null };
    const pid = String(r.product_id ?? "").trim();
    const q = n(r.quantity);
    if (!pid || q <= 0) continue;
    const res = await applyPosParkedStockRestore(supabase, orgId, locationId, pid, q);
    if (res.error) return res;
  }
  return {};
}

/**
 * Apply net stock deltas vs previous reservation rows; replace reservation rows for this cart.
 * @param locationIdPrev previous cart location before update (null for newly inserted carts)
 * @param locationIdNew current cart location after save
 */
export async function syncPosParkedInventoryReservations(
  supabase: Supabase,
  orgId: string,
  parkedCartId: string,
  locationIdPrev: string | null,
  locationIdNew: string,
  payload: Record<string, unknown>
): Promise<{ error?: string }> {
  const rawLines = payload.lines;
  const lines = (Array.isArray(rawLines) ? rawLines : []) as PosLineStockLike[];
  const newMap = computePosStockDeductionsByProduct(lines);

  const { data: existingRows, error: exErr } = await supabase
    .from("pos_parked_inventory_reservations")
    .select("product_id, quantity")
    .eq("organization_id", orgId)
    .eq("pos_parked_cart_id", parkedCartId);
  if (exErr) {
    if (isMissingParkedInvDbRelation(exErr)) return {};
    return { error: exErr.message };
  }

  const oldMap = new Map<string, number>();
  for (const row of existingRows ?? []) {
    const r = row as { product_id?: string; quantity?: number | string | null };
    const pid = String(r.product_id ?? "").trim();
    if (!pid) continue;
    oldMap.set(pid, (oldMap.get(pid) ?? 0) + n(r.quantity));
  }

  const locPrev = locationIdPrev?.trim() || null;
  const locNew = locationIdNew.trim();
  if (!locNew) return { error: "Location is required to sync parked inventory." };

  if (locPrev && locPrev !== locNew) {
    for (const [pid, qty] of oldMap) {
      if (qty > 1e-9) {
        const res = await applyPosParkedStockRestore(supabase, orgId, locPrev, pid, qty);
        if (res.error) return res;
      }
    }
    for (const [pid, qty] of newMap) {
      if (qty > 1e-9) {
        const res = await applyPosParkedStockDeduct(supabase, orgId, locNew, pid, qty);
        if (res.error) return res;
      }
    }
  } else {
    const allIds = new Set<string>([...oldMap.keys(), ...newMap.keys()]);
    for (const pid of allIds) {
      const oldQ = oldMap.get(pid) ?? 0;
      const newQ = newMap.get(pid) ?? 0;
      const delta = newQ - oldQ;
      if (delta > 1e-9) {
        const res = await applyPosParkedStockDeduct(supabase, orgId, locNew, pid, delta);
        if (res.error) return res;
      } else if (delta < -1e-9) {
        const res = await applyPosParkedStockRestore(supabase, orgId, locNew, pid, -delta);
        if (res.error) return res;
      }
    }
  }

  const { error: delErr } = await supabase
    .from("pos_parked_inventory_reservations")
    .delete()
    .eq("organization_id", orgId)
    .eq("pos_parked_cart_id", parkedCartId);
  if (delErr) {
    if (isMissingParkedInvDbRelation(delErr)) return {};
    return { error: delErr.message };
  }

  const insertRows = [...newMap.entries()]
    .filter(([, q]) => q > 1e-9)
    .map(([product_id, quantity]) => ({
      organization_id: orgId,
      pos_parked_cart_id: parkedCartId,
      product_id,
      quantity,
    }));

  if (insertRows.length === 0) return {};

  const { error: insErr } = await supabase.from("pos_parked_inventory_reservations").insert(insertRows);
  if (insErr) {
    if (isMissingParkedInvDbRelation(insErr)) return {};
    return { error: insErr.message };
  }
  return {};
}
