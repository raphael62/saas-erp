import { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Matches `sync_inventory_location_balance_from_product`: first active location by code (nulls last), then name. */
export async function getDefaultInventoryLocationId(
  supabase: ServerClient,
  orgId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("locations")
    .select("id, code, name, is_active")
    .eq("organization_id", orgId);
  if (error || !data?.length) return null;
  // Align with SQL: `where coalesce(l.is_active, true)` — `.eq("is_active", true)` wrongly excludes NULL.
  const eligible = data.filter((l) => (l as { is_active?: boolean | null }).is_active !== false);
  if (!eligible.length) return null;
  const sorted = [...eligible].sort((a, b) => {
    const ac = a.code != null && String(a.code).trim() !== "" ? String(a.code) : null;
    const bc = b.code != null && String(b.code).trim() !== "" ? String(b.code) : null;
    if (ac === null && bc !== null) return 1;
    if (ac !== null && bc === null) return -1;
    if (ac !== null && bc !== null) {
      const c = ac.localeCompare(bc, undefined, { numeric: true });
      if (c !== 0) return c;
    }
    return String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { numeric: true });
  });
  return sorted[0]?.id ? String(sorted[0].id) : null;
}

/**
 * Add `delta` to the balance at one location (upsert / read-modify-write).
 * Used to adjust per-location stock after `products.stock_quantity` changes (which the DB trigger applies to the default location only).
 */
export async function incrementLocationBalance(
  supabase: ServerClient,
  orgId: string,
  productId: string,
  locationId: string,
  delta: number
): Promise<{ error?: string }> {
  if (!delta || !locationId || !productId) return {};
  const { data: row, error: selErr } = await supabase
    .from("inventory_location_balances")
    .select("quantity")
    .eq("organization_id", orgId)
    .eq("product_id", productId)
    .eq("location_id", locationId)
    .maybeSingle();
  if (selErr) return { error: selErr.message };
  const q = Number((row as { quantity?: number } | null)?.quantity ?? 0);
  const next = q + delta;
  const { error: upErr } = await supabase.from("inventory_location_balances").upsert(
    {
      organization_id: orgId,
      product_id: productId,
      location_id: locationId,
      quantity: next,
    },
    { onConflict: "organization_id,product_id,location_id" }
  );
  if (upErr) return { error: upErr.message };
  return {};
}

/**
 * The DB trigger adds `stockQuantityDelta` to the default location when `products.stock_quantity` changes.
 * When the business event actually occurred at `targetLocationId`, move that delta from default to target.
 */
export async function reassignInventoryDeltaFromDefaultLocation(
  supabase: ServerClient,
  orgId: string,
  productId: string,
  stockQuantityDelta: number,
  targetLocationId: string | null | undefined
): Promise<{ error?: string }> {
  if (!stockQuantityDelta || !targetLocationId) return {};
  const defaultId = await getDefaultInventoryLocationId(supabase, orgId);
  if (!defaultId) {
    // Trigger also skips per-location when no eligible location; put stock at the document location.
    return incrementLocationBalance(supabase, orgId, productId, targetLocationId, stockQuantityDelta);
  }
  if (String(defaultId) === String(targetLocationId)) return {};
  const e1 = await incrementLocationBalance(supabase, orgId, productId, defaultId, -stockQuantityDelta);
  if (e1.error) return e1;
  const e2 = await incrementLocationBalance(supabase, orgId, productId, targetLocationId, stockQuantityDelta);
  if (e2.error) return e2;
  return {};
}

export async function applyLocationTransferLines(
  supabase: ServerClient,
  orgId: string,
  fromLocationId: string,
  toLocationId: string,
  lines: Array<{ product_id: string; ctn_qty: number }>
): Promise<{ error?: string }> {
  for (const line of lines) {
    const pid = String(line.product_id ?? "").trim();
    const qty = Number(line.ctn_qty ?? 0);
    if (!pid || !(qty > 0)) continue;
    const e1 = await incrementLocationBalance(supabase, orgId, pid, fromLocationId, -qty);
    if (e1.error) return e1;
    const e2 = await incrementLocationBalance(supabase, orgId, pid, toLocationId, qty);
    if (e2.error) return e2;
  }
  return {};
}

/** Undo a prior {@link applyLocationTransferLines} with the same header/lines. */
export async function reverseLocationTransferLines(
  supabase: ServerClient,
  orgId: string,
  fromLocationId: string,
  toLocationId: string,
  lines: Array<{ product_id: string; ctn_qty: number }>
): Promise<{ error?: string }> {
  return applyLocationTransferLines(supabase, orgId, toLocationId, fromLocationId, lines);
}
