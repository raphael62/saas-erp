"use server";

import { revalidatePath } from "next/cache";
import { gateModulePageAction } from "@/lib/mutation-gate";

export type RoleRow = {
  id: string;
  name: string;
  is_active: boolean;
  user_count: number;
};

export async function listRoles(): Promise<{ roles: RoleRow[]; error?: string }> {
  const gate = await gateModulePageAction("settings", "roles-permissions", "view");
  if (!gate.ok) return { roles: [], error: gate.error };
  const { supabase, orgId } = gate;

  const { data: roles } = await supabase
    .from("roles")
    .select("id, name, is_active")
    .eq("organization_id", orgId)
    .order("name");

  if (!roles?.length) return { roles: [] };

  const roleIdList = roles.map((r) => r.id);

  const { data: prLinks } = await supabase
    .from("profile_roles")
    .select("profile_id, role_id")
    .eq("organization_id", orgId)
    .in("role_id", roleIdList);

  const countByRole: Record<string, number> = {};
  for (const id of roleIdList) countByRole[id] = 0;

  const profilesWithJunction = new Set<string>();
  for (const row of prLinks ?? []) {
    const rid = (row as { profile_id: string; role_id: string }).role_id;
    const pid = (row as { profile_id: string; role_id: string }).profile_id;
    profilesWithJunction.add(pid);
    if (countByRole[rid] !== undefined) countByRole[rid] += 1;
  }

  const { data: legacyProfiles } = await supabase
    .from("profiles")
    .select("id, role_id")
    .eq("organization_id", orgId)
    .not("role_id", "is", null);

  for (const p of legacyProfiles ?? []) {
    const pid = (p as { id: string; role_id: string }).id;
    const rid = (p as { id: string; role_id: string }).role_id;
    if (!rid || countByRole[rid] === undefined) continue;
    if (!profilesWithJunction.has(pid)) countByRole[rid] += 1;
  }

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
  const gate = await gateModulePageAction("settings", "roles-permissions", "create");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId } = gate;

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Role name is required" };

  const { data, error } = await supabase
    .from("roles")
    .insert({ organization_id: orgId, name })
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
  const gate = await gateModulePageAction("settings", "roles-permissions", "view");
  if (!gate.ok) return { permissions: [], error: gate.error };
  const { supabase, orgId } = gate;

  const { data: roleRow } = await supabase
    .from("roles")
    .select("id")
    .eq("id", roleId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!roleRow) return { permissions: [], error: "Role not found." };

  const { data, error } = await supabase
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
  const gate = await gateModulePageAction("settings", "roles-permissions", "edit");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId } = gate;

  const { data: roleRow } = await supabase
    .from("roles")
    .select("id")
    .eq("id", roleId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!roleRow) return { error: "Role not found." };

  const { error: delError } = await supabase
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

  const { error: insError } = await supabase.from("role_permissions").insert(rows);

  if (insError) return { error: insError.message };
  revalidatePath("/dashboard/settings/roles-permissions");
  return {};
}
