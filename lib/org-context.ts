/**
 * Server-side org resolution. Uses admin client as fallback when RLS/session
 * returns null organization_id. Platform admins get first org as context.
 * When DEV_BYPASS_ORG=1, devs always get an org (created if needed).
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { isPlatformAdmin, isDevBypassEnabled } from "./platform-admin";

/**
 * When dev bypass: get or create first org, assign to user, return orgId.
 * Never returns null when DEV_BYPASS_ORG=1 (unless DB/start_registration fails).
 */
export async function ensureDevOrg(userId: string): Promise<string | null> {
  if (!isDevBypassEnabled()) return null;
  try {
    const admin = createAdminClient();
    const { data: firstOrg } = await admin.from("organizations").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    let orgId: string | null = firstOrg ? (firstOrg as { id: string }).id : null;

    if (!orgId) {
      try {
        const { data: reg } = await admin.rpc("start_registration", { p_company_name: "Dev Org", p_phone: null });
        orgId = (reg as { org_id?: string } | null)?.org_id ?? null;
      } catch {
        const code = String(100000 + Math.floor(Math.random() * 900000));
        const { data: inserted } = await admin
          .from("organizations")
          .insert({ name: "Dev Org", code } as Record<string, unknown>)
          .select("id")
          .single();
        orgId = inserted ? (inserted as { id: string }).id : null;
        if (!orgId) {
          const { data: fallback } = await admin.from("organizations").insert({ name: "Dev Org" }).select("id").single();
          orgId = fallback ? (fallback as { id: string }).id : null;
        }
      }
      if (orgId) {
        await admin.from("organizations").update({ created_by: userId }).eq("id", orgId).is("created_by", null);
      }
    }
    if (orgId) {
      await admin.from("profiles").update({ organization_id: orgId, role: "super_admin" }).eq("id", userId);
      revalidatePath("/dashboard", "layout");
    }
    return orgId;
  } catch {
    return null;
  }
}

export async function getOrgIdForUser(userId: string, userEmail?: string | null): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id, email")
      .eq("id", userId)
      .single();

    const email = userEmail ?? (profile as { email?: string } | null)?.email ?? null;
    const isPlatform = isPlatformAdmin(email);
    const devBypass = isDevBypassEnabled();

    let orgId = (profile as { organization_id?: string | null } | null)?.organization_id ?? null;

    if (!orgId && (isPlatform || devBypass)) {
      let firstOrgId: string | null = null;
      const { data: firstOrg } = await admin
        .from("organizations")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (firstOrg) {
        firstOrgId = (firstOrg as { id: string }).id;
      } else if (devBypass) {
        const { data: regData } = await admin.rpc("start_registration", {
          p_company_name: "Dev Org",
          p_phone: null,
        });
        firstOrgId = (regData as { org_id?: string } | null)?.org_id ?? null;
      }

      if (firstOrgId) {
        orgId = firstOrgId;
        await admin
          .from("profiles")
          .update({ organization_id: orgId, role: isPlatform ? "platform_admin" : "super_admin" })
          .eq("id", userId);
        if (devBypass && !firstOrg) {
          await admin.from("organizations").update({ created_by: userId }).eq("id", firstOrgId).is("created_by", null);
        }
        revalidatePath("/dashboard", "layout");
      }
    }

    if (!orgId && !isPlatform && !devBypass) {
        const { data: orgsByCreator } = await admin
          .from("organizations")
          .select("id")
          .eq("created_by", userId)
          .order("created_at", { ascending: false })
          .limit(1);
        let org = orgsByCreator?.[0] ?? null;

        if (!org) {
          const { data: orgsUnassigned } = await admin
            .from("organizations")
            .select("id")
            .is("created_by", null)
            .order("created_at", { ascending: false })
            .limit(1);
          org = orgsUnassigned?.[0] ?? null;
        }

        if (org) {
          await admin
            .from("profiles")
            .update({ organization_id: org.id, role: "super_admin" })
            .eq("id", userId);
          await admin.from("organizations").update({ created_by: userId }).eq("id", org.id).is("created_by", null);
          orgId = org.id;
          revalidatePath("/dashboard", "layout");
        }
    }

    if (!orgId && isDevBypassEnabled()) {
      orgId = await ensureDevOrg(userId);
    }
    return orgId;
  } catch {
    if (isDevBypassEnabled()) {
      return ensureDevOrg(userId);
    }
    return null;
  }
}

export async function getProfileWithOrg(userId: string, userEmail?: string | null): Promise<{
  orgId: string | null;
  fullName: string | null;
  role: string | null;
}> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, full_name, role, email")
    .eq("id", userId)
    .single();

  const prof = profile as { organization_id?: string | null; full_name?: string | null; role?: string | null; email?: string } | null;
  let orgId = prof?.organization_id ?? null;
  const email = userEmail ?? prof?.email ?? null;

  if (!orgId) {
    orgId = await getOrgIdForUser(userId, email);
  }
  if (!orgId && isDevBypassEnabled()) {
    orgId = await ensureDevOrg(userId);
  }

  return {
    orgId,
    fullName: prof?.full_name ?? null,
    role: prof?.role ?? null,
  };
}

/**
 * For server actions: resolve org for current user. Handles dev bypass.
 * Use this instead of raw profile.organization_id to ensure DEV_BYPASS_ORG works.
 */
export async function getOrgContextForAction(): Promise<
  | { ok: true; userId: string; orgId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; userId?: string; orgId: null; supabase: Awaited<ReturnType<typeof createClient>>; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, orgId: null, supabase, error: "Unauthorized" };
  }
  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  const resolved = orgId ?? (isDevBypassEnabled() ? await ensureDevOrg(user.id) : null);
  if (resolved) {
    return { ok: true, userId: user.id, orgId: resolved, supabase };
  }
  return { ok: false, userId: user.id, orgId: null, supabase, error: "No organization" };
}

/**
 * For dashboard pages that need orgId. Fetches user, ensures org, returns orgId or null.
 * When DEV_BYPASS_ORG=1, always resolves to an org (creates if needed) so devs never see NoOrgPrompt.
 */
export async function requireOrgId(): Promise<{ userId: string; orgId: string } | { userId: string; orgId: null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
    throw new Error("Unreachable");
  }

  let { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId && isDevBypassEnabled()) {
    orgId = await ensureDevOrg(user.id);
  }
  return { userId: user.id, orgId: orgId ?? null };
}
