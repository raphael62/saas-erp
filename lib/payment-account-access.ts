import type { SupabaseClient } from "@supabase/supabase-js";
import { hasFullAccess } from "@/lib/roles";

export { userHasShopSalesRepRole } from "@/lib/pos-staff-roles";

/**
 * Who bypasses `profile_payment_accounts`: same tier as `hasFullAccess`
 * (`platform_admin`, `super_admin`, `admin`), plus org creator (matches `canAccess`).
 */

export async function isSuperAdminUser(
  supabase: SupabaseClient,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, role_id")
    .eq("id", userId)
    .maybeSingle();

  const legacyRole = (profile as { role?: string | null } | null)?.role ?? null;
  if (hasFullAccess(legacyRole)) return true;

  const legacyRoleId = (profile as { role_id?: string | null } | null)?.role_id ?? null;
  if (legacyRoleId && orgId) {
    const { data: roleRow } = await supabase
      .from("roles")
      .select("name")
      .eq("id", legacyRoleId)
      .eq("organization_id", orgId)
      .maybeSingle();
    const roleName = (roleRow as { name?: string | null } | null)?.name ?? null;
    if (hasFullAccess(roleName)) return true;
  }

  if (orgId) {
    const { data: org } = await supabase
      .from("organizations")
      .select("created_by")
      .eq("id", orgId)
      .maybeSingle();
    if ((org as { created_by?: string | null } | null)?.created_by === userId) {
      return true;
    }
  }

  const { data: rows } = await supabase
    .from("profile_roles")
    .select("roles(name)")
    .eq("profile_id", userId)
    .eq("organization_id", orgId);

  const joined = rows as
    | { roles: { name: string } | { name: string }[] | null }[]
    | null;

  if (!joined?.length) return false;

  for (const row of joined) {
    const r = row.roles;
    const names = Array.isArray(r) ? r.map((x) => x?.name) : [r?.name];
    for (const name of names) {
      if (hasFullAccess(name)) return true;
    }
  }

  return false;
}

export type PaymentAccountAccess = {
  unrestricted: boolean;
  allowedIds: Set<string>;
};

export async function getPaymentAccountAccessForUser(
  supabase: SupabaseClient,
  userId: string,
  orgId: string
): Promise<PaymentAccountAccess> {
  const unrestricted = await isSuperAdminUser(supabase, userId, orgId);
  if (unrestricted) {
    return { unrestricted: true, allowedIds: new Set() };
  }

  const { data: links } = await supabase
    .from("profile_payment_accounts")
    .select("payment_account_id")
    .eq("profile_id", userId)
    .eq("organization_id", orgId);

  const allowedIds = new Set<string>();
  for (const row of links ?? []) {
    const id = (row as { payment_account_id?: string }).payment_account_id;
    if (id) allowedIds.add(id);
  }

  return { unrestricted: false, allowedIds };
}

export function assertPaymentAccountIdAllowed(
  access: PaymentAccountAccess,
  paymentAccountId: string | null | undefined
): { ok: true } | { ok: false; error: string } {
  if (access.unrestricted) return { ok: true };
  if (!paymentAccountId) {
    return { ok: false, error: "Select a payment account assigned to you." };
  }
  if (!access.allowedIds.has(paymentAccountId)) {
    return {
      ok: false,
      error: "This payment account is not assigned to you.",
    };
  }
  return { ok: true };
}

export async function resolvePaymentAccountIdFromLabel(
  supabase: SupabaseClient,
  orgId: string,
  label: string
): Promise<string | null> {
  const trimmed = label.trim();
  if (!trimmed) return null;

  const { data: rows } = await supabase
    .from("payment_accounts")
    .select("id, name, code")
    .eq("organization_id", orgId);

  for (const row of rows ?? []) {
    const r = row as { id: string; name: string | null; code: string | null };
    const name = (r.name ?? "").trim();
    const code = (r.code ?? "").trim();
    if (name === trimmed || code === trimmed) return r.id;
  }

  return null;
}

export async function assertPaymentAccountLabelAllowed(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  paymentAccountLabel: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await getPaymentAccountAccessForUser(supabase, userId, orgId);
  if (access.unrestricted) return { ok: true };

  const accId = await resolvePaymentAccountIdFromLabel(
    supabase,
    orgId,
    paymentAccountLabel
  );
  if (!accId) {
    return { ok: false, error: "Invalid payment account." };
  }
  return assertPaymentAccountIdAllowed(access, accId);
}
