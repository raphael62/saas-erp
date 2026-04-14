"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { gateModulePageAction } from "@/lib/mutation-gate";
import { getUserTransactionScope, scopeAllowsInvoiceRow } from "@/lib/user-transaction-scope";
import { userHasCashierRole } from "@/lib/pos-staff-roles";
import {
  computePromoRewardCartonsByPromotionId,
  type PromoCartonLineLike,
} from "@/lib/pos-promo-cartons";
import {
  reversePosParkedInventoryForCartBeforeDelete,
  syncPosParkedInventoryReservations,
} from "@/lib/pos-parked-inventory-sync";

function n(v: string | number | null | undefined): number {
  const raw = String(v ?? "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function isMissingDbRelation(err: { message?: string } | null | undefined): boolean {
  return Boolean(err?.message?.toLowerCase().includes("does not exist"));
}

/** Replace reservation rows for this parked cart; enforce budget − consumed − other parked. */
async function syncPosParkedPromoReservations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  parkedCartId: string,
  payload: Record<string, unknown>
): Promise<{ error?: string }> {
  const rawLines = payload.lines;
  const lines = (Array.isArray(rawLines) ? rawLines : []) as PromoCartonLineLike[];

  const { data: rulesData, error: rulesErr } = await supabase
    .from("promotion_rules")
    .select("promotion_id, reward_product_id")
    .eq("organization_id", orgId);
  if (rulesErr) {
    if (isMissingDbRelation(rulesErr)) return {};
    return { error: rulesErr.message };
  }
  const rules = (rulesData ?? []) as Array<{ promotion_id: string; reward_product_id: string | number }>;
  const wanted = computePromoRewardCartonsByPromotionId(lines, rules);

  const { data: promosData, error: promosErr } = await supabase
    .from("promotions")
    .select("id, promo_budget_cartons, consumed_cartons")
    .eq("organization_id", orgId);
  if (promosErr) {
    if (isMissingDbRelation(promosErr)) return {};
    return { error: promosErr.message };
  }
  const promoById = new Map(
    (promosData ?? []).map((p) => [String((p as { id: string }).id), p as { promo_budget_cartons?: number | null; consumed_cartons?: number | null }])
  );

  const { data: existingRes, error: exErr } = await supabase
    .from("pos_parked_promo_reservations")
    .select("promotion_id, reserved_cartons")
    .eq("organization_id", orgId)
    .neq("pos_parked_cart_id", parkedCartId);
  if (exErr) {
    if (isMissingDbRelation(exErr)) return {};
    return { error: exErr.message };
  }

  const reservedOthers = new Map<string, number>();
  for (const r of existingRes ?? []) {
    const row = r as { promotion_id?: string; reserved_cartons?: number | null };
    const pid = String(row.promotion_id ?? "");
    if (!pid) continue;
    reservedOthers.set(pid, (reservedOthers.get(pid) ?? 0) + n(row.reserved_cartons));
  }

  for (const [promoId, cartons] of wanted) {
    const p = promoById.get(promoId);
    if (!p) continue;
    const budget = p.promo_budget_cartons;
    if (budget == null) continue;
    const consumed = n(p.consumed_cartons);
    const other = reservedOthers.get(promoId) ?? 0;
    const avail = n(budget) - consumed - other;
    if (cartons > avail + 1e-6) {
      return {
        error: `Promotion reward cartons for this park (${cartons.toFixed(2)}) exceed what is left (${Math.max(0, avail).toFixed(2)} ctns after completed sales and other parked carts).`,
      };
    }
  }

  const { error: delErr } = await supabase
    .from("pos_parked_promo_reservations")
    .delete()
    .eq("organization_id", orgId)
    .eq("pos_parked_cart_id", parkedCartId);
  if (delErr) {
    if (isMissingDbRelation(delErr)) return {};
    return { error: delErr.message };
  }

  const insertRows = [...wanted.entries()]
    .filter(([, v]) => v > 0)
    .map(([promotion_id, reserved_cartons]) => ({
      organization_id: orgId,
      pos_parked_cart_id: parkedCartId,
      promotion_id,
      reserved_cartons,
    }));

  if (insertRows.length === 0) return {};

  const { error: insErr } = await supabase.from("pos_parked_promo_reservations").insert(insertRows);
  if (insErr) {
    if (isMissingDbRelation(insErr)) return {};
    return { error: insErr.message };
  }
  return {};
}

export type PosParkedCartRow = {
  id: string;
  organization_id: string;
  location_id: string;
  sales_rep_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function listPosParkedCarts(): Promise<{
  carts?: PosParkedCartRow[];
  error?: string;
}> {
  const gate = await gateModulePageAction("pos", "parked", "view");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId } = gate;

  const { data, error } = await supabase
    .from("pos_parked_carts")
    .select("id, organization_id, location_id, sales_rep_id, payload, created_at, updated_at")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });

  if (error) {
    if (error.message.toLowerCase().includes("does not exist")) {
      return { carts: [] };
    }
    return { error: error.message };
  }

  return {
    carts: (data ?? []) as PosParkedCartRow[],
  };
}

export type SavePosParkedCartInput = {
  id?: string | null;
  locationId: string;
  salesRepId: string;
  payload: Record<string, unknown>;
};

export async function savePosParkedCart(input: SavePosParkedCartInput): Promise<{
  ok?: boolean;
  id?: string;
  error?: string;
}> {
  const id = String(input.id ?? "").trim();
  const gate = await gateModulePageAction("pos", "new-sale", "create");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId, userId } = gate;

  const locationId = String(input.locationId ?? "").trim();
  const salesRepId = String(input.salesRepId ?? "").trim();
  if (!locationId) return { error: "Location is required to park a sale." };
  if (!salesRepId) return { error: "Sales rep is required to park a sale." };

  const scope = await getUserTransactionScope(supabase, userId, orgId);
  if (!scopeAllowsInvoiceRow(scope, locationId, salesRepId)) {
    return { error: "You are not allowed to park this sale for this location or sales rep." };
  }

  const payload = input.payload && typeof input.payload === "object" ? input.payload : {};

  if (id) {
    const { data: existing } = await supabase
      .from("pos_parked_carts")
      .select("id, location_id, sales_rep_id, payload")
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!existing) return { error: "Parked sale not found." };

    const prevLocationId =
      String((existing as { location_id?: string }).location_id ?? "").trim() || null;

    let outLocationId = locationId;
    let outSalesRepId = salesRepId;
    let outPayload = payload;
    const isCashier = await userHasCashierRole(supabase, userId, orgId);
    if (isCashier) {
      const row = existing as {
        location_id: string;
        sales_rep_id: string | null;
        payload?: unknown;
      };
      outLocationId = String(row.location_id ?? "").trim();
      outSalesRepId = String(row.sales_rep_id ?? "").trim();
      const prevP =
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {};
      const merged = { ...(outPayload as Record<string, unknown>) };
      merged.customerId = prevP.customerId;
      merged.salesRepId = outSalesRepId;
      merged.locationId = outLocationId;
      outPayload = merged;
    }

    const { error: updErr } = await supabase
      .from("pos_parked_carts")
      .update({
        location_id: outLocationId,
        sales_rep_id: outSalesRepId || null,
        payload: outPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organization_id", orgId);
    if (updErr) return { error: updErr.message };
    const invSync = await syncPosParkedInventoryReservations(
      supabase,
      orgId,
      id,
      prevLocationId,
      outLocationId,
      outPayload
    );
    if (invSync.error) return { error: invSync.error };
    const syncRes = await syncPosParkedPromoReservations(supabase, orgId, id, outPayload);
    if (syncRes.error) return { error: syncRes.error };
    revalidatePath("/dashboard/pos/parked");
    revalidatePath("/dashboard/pos/new-sale");
    return { ok: true, id };
  }

  const { data: ins, error: insErr } = await supabase
    .from("pos_parked_carts")
    .insert({
      organization_id: orgId,
      location_id: locationId,
      sales_rep_id: salesRepId,
      payload,
      parked_by: userId,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insErr) return { error: insErr.message };
  const newId = (ins as { id: string }).id;
  const invSync = await syncPosParkedInventoryReservations(supabase, orgId, newId, null, locationId, payload);
  if (invSync.error) return { error: invSync.error };
  const syncRes = await syncPosParkedPromoReservations(supabase, orgId, newId, payload);
  if (syncRes.error) return { error: syncRes.error };
  revalidatePath("/dashboard/pos/parked");
  revalidatePath("/dashboard/pos/new-sale");
  return { ok: true, id: newId };
}

/** Reverse inventory/promo state and delete row (no RBAC). Used after a successful POS checkout. */
export async function deletePosParkedCartAfterSuccessfulSale(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  cartId: string
): Promise<{ ok?: boolean; error?: string }> {
  const id = String(cartId ?? "").trim();
  if (!id) return { error: "Cart id is required." };

  const { data: cartRow, error: cartErr } = await supabase
    .from("pos_parked_carts")
    .select("location_id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (cartErr) return { error: cartErr.message };
  if (!cartRow) return { error: "Parked sale not found." };
  const delLocId = String((cartRow as { location_id?: string }).location_id ?? "").trim();
  if (delLocId) {
    const rev = await reversePosParkedInventoryForCartBeforeDelete(supabase, orgId, id, delLocId);
    if (rev.error) return { error: rev.error };
  }

  const { error } = await supabase.from("pos_parked_carts").delete().eq("id", id).eq("organization_id", orgId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/pos/parked");
  revalidatePath("/dashboard/pos/new-sale");
  return { ok: true };
}

export async function deletePosParkedCart(cartId: string): Promise<{ ok?: boolean; error?: string }> {
  const gate = await gateModulePageAction("pos", "new-sale", "edit");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId, userId } = gate;
  if (await userHasCashierRole(supabase, userId, orgId)) {
    return { error: "Cashiers cannot delete parked sales." };
  }
  return deletePosParkedCartAfterSuccessfulSale(supabase, orgId, cartId);
}

export async function getPosParkedCartPayload(cartId: string): Promise<{
  payload?: Record<string, unknown>;
  error?: string;
}> {
  const gate = await gateModulePageAction("pos", "parked", "view");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId } = gate;
  const id = String(cartId ?? "").trim();
  if (!id) return { error: "Cart id is required." };

  const { data, error } = await supabase
    .from("pos_parked_carts")
    .select("payload")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Parked sale not found." };
  const p = (data as { payload?: unknown }).payload;
  return { payload: (p && typeof p === "object" ? p : {}) as Record<string, unknown> };
}

/** Resume without deleting the cart (shared location / cashier workflow). */
export async function getPosParkedCartForResume(cartId: string): Promise<{
  cart?: { id: string; location_id: string; sales_rep_id: string | null; payload: Record<string, unknown> };
  error?: string;
}> {
  const gate = await gateModulePageAction("pos", "parked", "view");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId } = gate;
  const id = String(cartId ?? "").trim();
  if (!id) return { error: "Cart id is required." };

  const { data, error } = await supabase
    .from("pos_parked_carts")
    .select("id, location_id, sales_rep_id, payload")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Parked sale not found." };
  const row = data as {
    id: string;
    location_id: string;
    sales_rep_id: string | null;
    payload?: unknown;
  };
  const p = row.payload;
  const payload = (p && typeof p === "object" && !Array.isArray(p) ? p : {}) as Record<string, unknown>;
  return {
    cart: {
      id: row.id,
      location_id: row.location_id,
      sales_rep_id: row.sales_rep_id,
      payload,
    },
  };
}
