import type { SupabaseClient } from "@supabase/supabase-js";

const SHOP_SALES_REP_ROLES = new Set([
  "shop_sales_rep",
  "shop sales rep",
  "shopsalesrep",
]);

const CASHIER_ROLES = new Set([
  "cashier",
  "pos_cashier",
  "pos cashier",
  "shop_cashier",
  "shop cashier",
]);

/** Same normalization as DB `get_my_role()` (spaces and hyphens → _). */
function normRole(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export async function userHasShopSalesRepRole(
  supabase: SupabaseClient,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (SHOP_SALES_REP_ROLES.has(normRole(profile?.role))) return true;

  const { data: rows } = await supabase
    .from("profile_roles")
    .select("roles(name)")
    .eq("profile_id", userId)
    .eq("organization_id", orgId);

  const joined = rows as
    | { roles: { name: string } | { name: string }[] | null }[]
    | null;

  for (const row of joined ?? []) {
    const r = row.roles;
    const names = Array.isArray(r) ? r.map((x) => x?.name) : [r?.name];
    for (const name of names) {
      if (name && SHOP_SALES_REP_ROLES.has(normRole(name))) return true;
    }
  }

  return false;
}

export async function userHasCashierRole(
  supabase: SupabaseClient,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (CASHIER_ROLES.has(normRole(profile?.role))) return true;

  const { data: rows } = await supabase
    .from("profile_roles")
    .select("roles(name)")
    .eq("profile_id", userId)
    .eq("organization_id", orgId);

  const joined = rows as
    | { roles: { name: string } | { name: string }[] | null }[]
    | null;

  for (const row of joined ?? []) {
    const r = row.roles;
    const names = Array.isArray(r) ? r.map((x) => x?.name) : [r?.name];
    for (const name of names) {
      if (name && CASHIER_ROLES.has(normRole(name))) return true;
    }
  }

  return false;
}
