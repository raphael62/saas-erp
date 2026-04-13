/**
 * Transaction scope from user provisioning (locations + linked sales rep).
 * Mirrors DB logic in migration 066_transaction_scope_rls.sql (keep in sync).
 *
 * Rules (v1 — sales invoices, sales orders, POS):
 * - Unrestricted: legacy admin/super_admin/platform_admin, org owner, OR user with no
 *   linked_sales_rep_id, no default_location_id, and no profile_user_locations rows.
 * - Scoped: at least one of (linked rep, default location, or junction locations).
 *   - Location: row location_id must be non-null and in allowed set (junction ∪ default).
 *   - Rep: when linked_sales_rep_id is set, row sales_rep_id must match (non-null).
 * - Shop sales rep (RBAC / legacy role): always rep-scoped to linked_sales_rep_id (see DB067).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasFullAccess } from "@/lib/roles";
import { userHasShopSalesRepRole } from "@/lib/pos-staff-roles";

/** Use when no auth context (should not happen on protected routes). */
export const TRANSACTION_SCOPE_UNRESTRICTED: UserTransactionScope = {
  unrestricted: true,
  allowedLocationIds: [],
  restrictByLocation: false,
  linkedSalesRepId: null,
  restrictByRep: false,
  defaultLocationId: null,
};

export type UserTransactionScope = {
  unrestricted: boolean;
  /** Distinct location ids (junction ∪ default_location_id). */
  allowedLocationIds: string[];
  restrictByLocation: boolean;
  linkedSalesRepId: string | null;
  restrictByRep: boolean;
  /** profiles.default_location_id (for defaulting POS / forms). */
  defaultLocationId: string | null;
};

export function scopeAllowsInvoiceRow(
  scope: UserTransactionScope,
  locationId: string | null | undefined,
  salesRepId: string | null | undefined
): boolean {
  if (scope.unrestricted) return true;

  const loc = String(locationId ?? "").trim() || null;
  const rep = String(salesRepId ?? "").trim() || null;

  if (scope.restrictByLocation) {
    if (!loc) return false;
    if (!scope.allowedLocationIds.includes(loc)) return false;
  }

  if (scope.restrictByRep) {
    if (!scope.linkedSalesRepId || !rep || rep !== scope.linkedSalesRepId) return false;
  }

  return true;
}

export function filterLocationsByScope<T extends { id: string }>(
  scope: UserTransactionScope,
  locations: T[]
): T[] {
  if (scope.unrestricted || !scope.restrictByLocation) return locations;
  const allowed = new Set(scope.allowedLocationIds);
  return locations.filter((l) => allowed.has(l.id));
}

export function filterSalesRepsByScope<T extends { id: string }>(
  scope: UserTransactionScope,
  reps: T[]
): T[] {
  if (scope.unrestricted || !scope.restrictByRep) return reps;
  if (!scope.linkedSalesRepId) return [];
  return reps.filter((r) => r.id === scope.linkedSalesRepId);
}

/** Server-side: load scope for the signed-in user. */
export async function getUserTransactionScope(
  supabase: SupabaseClient,
  userId: string,
  orgId: string
): Promise<UserTransactionScope> {
  const emptyScope = (): UserTransactionScope => ({
    unrestricted: true,
    allowedLocationIds: [],
    restrictByLocation: false,
    linkedSalesRepId: null,
    restrictByRep: false,
    defaultLocationId: null,
  });

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("role, linked_sales_rep_id, default_location_id")
    .eq("id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (pErr || !profile) {
    return emptyScope();
  }

  const role = (profile as { role?: string | null }).role ?? null;
  const linkedSalesRepId =
    String((profile as { linked_sales_rep_id?: string | null }).linked_sales_rep_id ?? "").trim() || null;
  const defaultLocationId =
    String((profile as { default_location_id?: string | null }).default_location_id ?? "").trim() || null;

  const { data: orgRow } = await supabase
    .from("organizations")
    .select("created_by")
    .eq("id", orgId)
    .maybeSingle();
  const isOwner = (orgRow as { created_by?: string | null } | null)?.created_by === userId;

  if (hasFullAccess(role) || isOwner) {
    return {
      unrestricted: true,
      allowedLocationIds: [],
      restrictByLocation: false,
      linkedSalesRepId: null,
      restrictByRep: false,
      defaultLocationId: null,
    };
  }

  const { data: locRows } = await supabase
    .from("profile_user_locations")
    .select("location_id")
    .eq("profile_id", userId)
    .eq("organization_id", orgId);

  const fromJunction = (locRows ?? []).map((r: { location_id: string }) => r.location_id).filter(Boolean);
  const allowedSet = new Set<string>(fromJunction);
  if (defaultLocationId) allowedSet.add(defaultLocationId);
  const allowedLocationIds = [...allowedSet];

  let restrictByRep = Boolean(linkedSalesRepId);
  const restrictByLocation = allowedLocationIds.length > 0;

  const isShopSalesRep = await userHasShopSalesRepRole(supabase, userId, orgId);
  if (isShopSalesRep) {
    restrictByRep = true;
  }

  if (!restrictByRep && !restrictByLocation) {
    return emptyScope();
  }

  return {
    unrestricted: false,
    allowedLocationIds,
    restrictByLocation,
    linkedSalesRepId,
    restrictByRep,
    defaultLocationId: defaultLocationId || null,
  };
}
