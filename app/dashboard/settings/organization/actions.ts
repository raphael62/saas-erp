"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getContext() {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) {
    const isUnauth = ctx.error === "Unauthorized";
    return {
      error: isUnauth ? ("Unauthorized" as const) : ("No organization" as const),
      supabase: isUnauth ? null : ctx.supabase,
      userId: ctx.userId ?? null,
      orgId: null,
    };
  }
  return { error: null, supabase: ctx.supabase, userId: ctx.userId, orgId: ctx.orgId };
}

export type OrgRow = {
  id: string;
  name: string;
  slug: string | null;
  phone: string | null;
  code: string | null;
  created_by: string | null;
  subscription_ends_at: string | null;
};

export async function assignOrphanOrg(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const revalidate = () => {
    revalidatePath("/dashboard/settings/organization");
    revalidatePath("/dashboard/settings/roles-permissions");
    revalidatePath("/dashboard/settings/users");
  };

  try {
    const { data: orgId, error: rpcError } = await supabase.rpc("assign_orphan_org_to_user");
    if (!rpcError && orgId) {
      revalidate();
      return {};
    }
  } catch {
    // RPC may not exist or fail; fall through to admin client
  }

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (profile?.organization_id) {
      revalidate();
      return {};
    }

    const { data: orgsByCreator } = await admin
      .from("organizations")
      .select("id")
      .eq("created_by", user.id)
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

    if (!org) return { error: "No organization found. Create one first, or run the SQL fix in Supabase." };

    const { error: updateError } = await admin
      .from("profiles")
      .update({ organization_id: org.id })
      .eq("id", user.id);

    if (updateError) return { error: updateError.message };

    await admin
      .from("organizations")
      .update({ created_by: user.id })
      .eq("id", org.id)
      .is("created_by", null);

    revalidate();
    return {};
  } catch (err) {
    if (err instanceof Error && err.message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return { error: "Add SUPABASE_SERVICE_ROLE_KEY to .env.local (Supabase → Settings → API)" };
    }
    return { error: err instanceof Error ? err.message : "Failed to assign organization" };
  }
}

export async function getOrganization(): Promise<{ org: OrgRow | null; error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { org: null, error: ctx.error };
  if (!ctx.supabase || !ctx.orgId) return { org: null };

  const { data, error } = await ctx.supabase
    .from("organizations")
    .select("id, name, slug, phone, code, created_by, subscription_ends_at")
    .eq("id", ctx.orgId)
    .single();

  if (error) {
    if (error.message?.includes("subscription_ends_at")) {
      const { data: fb, error: err2 } = await ctx.supabase
        .from("organizations")
        .select("id, name, slug, phone, code, created_by")
        .eq("id", ctx.orgId)
        .single();
      if (err2 || !fb) return { org: null, error: err2?.message ?? error.message };
      return {
        org: {
          id: fb.id,
          name: fb.name,
          slug: fb.slug ?? null,
          phone: fb.phone ?? null,
          code: (fb as { code?: string }).code ?? null,
          created_by: fb.created_by ?? null,
          subscription_ends_at: null,
        },
      };
    }
    return { org: null, error: error.message };
  }
  if (!data) return { org: null };

  const row = data as { subscription_ends_at?: string | null };
  return {
    org: {
      id: data.id,
      name: data.name,
      slug: data.slug ?? null,
      phone: data.phone ?? null,
      code: (data as { code?: string }).code ?? null,
      created_by: data.created_by ?? null,
      subscription_ends_at: row.subscription_ends_at ?? null,
    },
  };
}

export async function createOrganization(formData: FormData): Promise<{ error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { error: ctx.error };
  if (!ctx.supabase || !ctx.userId) return { error: "Unauthorized" };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Organization name is required" };

  const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "org";
  const phone = (formData.get("phone") as string)?.trim() || null;

  const { data: orgId, error } = await ctx.supabase.rpc("create_organization_for_user", {
    p_name: name,
    p_slug: slug,
    p_phone: phone || null,
  });

  if (error) return { error: error.message };
  if (!orgId) return { error: "Failed to create organization" };

  revalidatePath("/dashboard/settings/organization");
  revalidatePath("/dashboard/settings/roles-permissions");
  revalidatePath("/dashboard/settings/users");
  return {};
}

export async function updateOrganization(
  orgId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { error: ctx.error };
  if (!ctx.supabase || !ctx.orgId || ctx.orgId !== orgId) return { error: "Forbidden" };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Organization name is required" };

  const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "org";
  const phone = (formData.get("phone") as string)?.trim() || null;

  const subDate = (formData.get("subscription_ends_date") as string)?.trim() || "";
  const subscription_ends_at = subDate ? `${subDate}T23:59:59.999Z` : null;

  const updatedAt = new Date().toISOString();
  const { error } = await ctx.supabase
    .from("organizations")
    .update({
      name,
      slug,
      phone,
      subscription_ends_at,
      updated_at: updatedAt,
    })
    .eq("id", orgId);

  if (error?.message?.includes("subscription_ends_at")) {
    const { error: err2 } = await ctx.supabase
      .from("organizations")
      .update({ name, slug, phone, updated_at: updatedAt })
      .eq("id", orgId);
    if (err2) return { error: err2.message };
  } else if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings/organization");
  revalidatePath("/dashboard", "layout");
  return {};
}
