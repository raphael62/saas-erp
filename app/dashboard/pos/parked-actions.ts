"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { gateModulePageAction } from "@/lib/mutation-gate";
import { getUserTransactionScope, scopeAllowsInvoiceRow } from "@/lib/user-transaction-scope";

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
      .select("id")
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!existing) return { error: "Parked sale not found." };

    const { error: updErr } = await supabase
      .from("pos_parked_carts")
      .update({
        location_id: locationId,
        sales_rep_id: salesRepId,
        payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organization_id", orgId);
    if (updErr) return { error: updErr.message };
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
  revalidatePath("/dashboard/pos/parked");
  revalidatePath("/dashboard/pos/new-sale");
  return { ok: true, id: newId };
}

export async function deletePosParkedCart(cartId: string): Promise<{ ok?: boolean; error?: string }> {
  const gate = await gateModulePageAction("pos", "new-sale", "edit");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId } = gate;
  const id = String(cartId ?? "").trim();
  if (!id) return { error: "Cart id is required." };

  const { error } = await supabase.from("pos_parked_carts").delete().eq("id", id).eq("organization_id", orgId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/pos/parked");
  revalidatePath("/dashboard/pos/new-sale");
  return { ok: true };
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
