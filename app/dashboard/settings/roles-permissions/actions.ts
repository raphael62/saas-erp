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

export type RoleRow = {
  id: string;
  name: string;
  is_active: boolean;
  user_count: number;
};

export async function listRoles(): Promise<{ roles: RoleRow[]; error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { roles: [], error: ctx.error };
  if (!ctx.supabase || !ctx.orgId) return { roles: [] };

  const { data: roles } = await ctx.supabase
    .from("roles")
    .select("id, name, is_active")
    .eq("organization_id", ctx.orgId)
    .order("name");

  if (!roles?.length) return { roles: [] };

  const { data: counts } = await ctx.supabase
    .from("profiles")
    .select("role_id")
    .in("role_id", roles.map((r) => r.id));

  const countByRole = (counts ?? []).reduce<Record<string, number>>((acc, p) => {
    const rid = (p as { role_id?: string }).role_id;
    if (rid) acc[rid] = (acc[rid] ?? 0) + 1;
    return acc;
  }, {});

  return {
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      is_active: r.is_active ?? true,
      user_count: countByRole[r.id] ?? 0,
    })),
  };
}

export async function createRole(formData: FormData): Promise<{ id?: string; error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { error: ctx.error };
  if (!ctx.supabase || !ctx.orgId) return { error: "No organization" };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Role name is required" };

  const { data, error } = await ctx.supabase
    .from("roles")
    .insert({ organization_id: ctx.orgId, name })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings/roles-permissions");
  return { id: data.id };
}

export type PermissionRow = {
  id?: string;
  module_key: string;
  page_key: string | null;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
  is_full: boolean;
};

export async function getRolePermissions(
  roleId: string
): Promise<{ permissions: PermissionRow[]; error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { permissions: [], error: ctx.error };
  if (!ctx.supabase) return { permissions: [] };

  const { data, error } = await ctx.supabase
    .from("role_permissions")
    .select("id, module_key, page_key, can_view, can_create, can_edit, can_delete, can_export, is_full")
    .eq("role_id", roleId);

  if (error) return { permissions: [], error: error.message };

  return {
    permissions: (data ?? []).map((r) => ({
      id: r.id,
      module_key: r.module_key,
      page_key: r.page_key,
      can_view: r.can_view ?? false,
      can_create: r.can_create ?? false,
      can_edit: r.can_edit ?? false,
      can_delete: r.can_delete ?? false,
      can_export: r.can_export ?? false,
      is_full: r.is_full ?? false,
    })),
  };
}

export async function saveRolePermissions(
  roleId: string,
  permissions: Omit<PermissionRow, "id">[]
): Promise<{ error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { error: ctx.error };
  if (!ctx.supabase) return { error: "Unauthorized" };

  const { error: delError } = await ctx.supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId);

  if (delError) return { error: delError.message };

  const toInsert = permissions.filter(
    (p) =>
      p.can_view ||
      p.can_create ||
      p.can_edit ||
      p.can_delete ||
      p.can_export ||
      p.is_full
  );
  if (toInsert.length === 0) {
    revalidatePath("/dashboard/settings/roles-permissions");
    return {};
  }

  const rows = toInsert.map((p) => ({
    role_id: roleId,
    module_key: p.module_key,
    page_key: p.page_key,
    can_view: p.can_view,
    can_create: p.can_create,
    can_edit: p.can_edit,
    can_delete: p.can_delete,
    can_export: p.can_export,
    is_full: p.is_full,
  }));

  const { error: insError } = await ctx.supabase.from("role_permissions").insert(rows);

  if (insError) return { error: insError.message };
  revalidatePath("/dashboard/settings/roles-permissions");
  return {};
}
