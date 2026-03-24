"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { hasFullAccess } from "@/lib/roles";

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
  const { userId, orgId, supabase } = ctx;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  const role = (profile as { role?: string | null } | null)?.role ?? null;
  const { data: org } = await supabase.from("organizations").select("created_by").eq("id", orgId).single();
  const isOwner = (org as { created_by?: string | null } | null)?.created_by === userId;
  const canManage = hasFullAccess(role) || isOwner;
  if (!canManage)
    return { error: "Forbidden" as const, supabase: null, userId, orgId: null };
  return { error: null, supabase, userId, orgId };
}

export type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role_id: string | null;
  role_name: string | null;
};

export type RoleOption = { id: string; name: string };

export async function listUsers(): Promise<{ users: UserRow[]; error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { users: [], error: ctx.error };
  if (!ctx.supabase || !ctx.orgId) return { users: [] };

  const { data: profiles, error: profError } = await ctx.supabase
    .from("profiles")
    .select("id, full_name, email, role_id")
    .eq("organization_id", ctx.orgId)
    .order("full_name");

  if (profError) return { users: [], error: profError.message };
  if (!profiles?.length) return { users: [] };

  const roleIds = [...new Set((profiles as { role_id?: string | null }[]).map((p) => p.role_id).filter(Boolean))] as string[];
  let roleMap: Record<string, string> = {};
  if (roleIds.length > 0) {
    const { data: roles } = await ctx.supabase
      .from("roles")
      .select("id, name")
      .in("id", roleIds);
    roleMap = (roles ?? []).reduce<Record<string, string>>((acc, r) => {
      acc[r.id] = r.name;
      return acc;
    }, {});
  }

  return {
    users: (profiles as { id: string; full_name?: string | null; email?: string | null; role_id?: string | null }[]).map((p) => ({
      id: p.id,
      full_name: p.full_name ?? null,
      email: p.email ?? null,
      role_id: p.role_id ?? null,
      role_name: p.role_id ? roleMap[p.role_id] ?? null : null,
    })),
  };
}

export async function listRolesForSelect(): Promise<{ roles: RoleOption[]; error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { roles: [], error: ctx.error };
  if (!ctx.supabase || !ctx.orgId) return { roles: [] };

  const { data: roles, error } = await ctx.supabase
    .from("roles")
    .select("id, name")
    .eq("organization_id", ctx.orgId)
    .eq("is_active", true)
    .order("name");

  if (error) return { roles: [], error: error.message };
  return {
    roles: (roles ?? []).map((r) => ({ id: r.id, name: r.name })),
  };
}

export async function inviteUser(email: string, fullName?: string): Promise<{ error?: string; code?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { error: ctx.error };
  if (!ctx.supabase || !ctx.orgId) return { error: "No organization" };

  const trimmed = email?.trim();
  if (!trimmed) return { error: "Email is required" };

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();

    const { data: org } = await admin
      .from("organizations")
      .select("code")
      .eq("id", ctx.orgId)
      .single();
    const code = (org as { code?: string } | null)?.code ?? null;

    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback`;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(trimmed, {
      data: {
        organization_id: ctx.orgId,
        full_name: fullName?.trim() ?? "",
        company_code: code ?? "",
      },
      redirectTo,
    });

    if (error) return { error: error.message };

    const userId = data?.user?.id;
    if (userId) {
      await admin.from("profiles").update({ organization_id: ctx.orgId, full_name: fullName?.trim() || null }).eq("id", userId);
    }

    revalidatePath("/dashboard/settings/users");
    return { code: code ?? undefined };
  } catch (err) {
    if (err instanceof Error && err.message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return { error: "Add SUPABASE_SERVICE_ROLE_KEY to .env.local" };
    }
    return { error: err instanceof Error ? err.message : "Failed to invite user" };
  }
}

export async function updateUserRole(
  userId: string,
  roleId: string | null
): Promise<{ error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { error: ctx.error };
  if (!ctx.supabase || !ctx.orgId) return { error: "No organization" };

  const { error } = await ctx.supabase
    .from("profiles")
    .update({ role_id: roleId })
    .eq("id", userId)
    .eq("organization_id", ctx.orgId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings/users");
  revalidatePath("/dashboard/settings/roles-permissions");
  return {};
}
