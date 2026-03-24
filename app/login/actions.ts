"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin, isDevBypassEnabled } from "@/lib/platform-admin";

/**
 * Validates login. DEV_BYPASS_ORG and platform admins skip company code.
 */
export async function validateLoginWithCode(
  companyCode: string,
  userId: string,
  userEmail: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!userId) {
    return { ok: false, error: "Not signed in" };
  }

  if (isDevBypassEnabled() || isPlatformAdmin(userEmail)) {
    return { ok: true };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .single();

  const orgId = (profile as { organization_id?: string | null } | null)?.organization_id ?? null;
  if (!orgId) {
    return { ok: false, error: "No organization assigned. Contact your administrator." };
  }

  const { data: org } = await admin
    .from("organizations")
    .select("code")
    .eq("id", orgId)
    .single();

  const orgCode = (org as { code?: string } | null)?.code ?? "";
  const enteredCode = companyCode.trim().replace(/\s/g, "");
  if (orgCode !== enteredCode) {
    return { ok: false, error: "Wrong company code." };
  }

  return { ok: true };
}
