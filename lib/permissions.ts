/**
 * Runtime permission checks and nav filtering.
 * Uses role_permissions when role_id is set; falls back to legacy role for admin/super_admin.
 */

import { createClient } from "@/lib/supabase/server";
import { hasFullAccess } from "@/lib/roles";
import { mainNavItems, type MainNavItemSerialized } from "@/lib/nav-items";
import { permissionTree, getRoutePermissions } from "./permissions-config";

export type PermissionAction = "view" | "create" | "edit" | "delete" | "export";

type RolePermission = {
  module_key: string;
  page_key: string | null;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
  is_full: boolean;
};

async function getPermissionMap(
  userId: string,
  roleId: string | null,
  orgId: string | null
): Promise<Map<string, RolePermission>> {
  if (!roleId || !orgId) return new Map();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("role_permissions")
    .select("module_key, page_key, can_view, can_create, can_edit, can_delete, can_export, is_full")
    .eq("role_id", roleId);

  const map = new Map<string, RolePermission>();
  for (const r of rows ?? []) {
    const key = `${r.module_key}:${r.page_key ?? ""}`;
    map.set(key, r as RolePermission);
  }
  return map;
}

function hasPermission(
  perm: RolePermission | undefined,
  action: PermissionAction,
  isModuleLevel: boolean
): boolean {
  if (!perm) return false;
  if (perm.is_full && isModuleLevel) return true;
  switch (action) {
    case "view":
      return perm.can_view;
    case "create":
      return perm.can_create;
    case "edit":
      return perm.can_edit;
    case "delete":
      return perm.can_delete;
    case "export":
      return perm.can_export;
    default:
      return false;
  }
}

/**
 * Check if user can perform an action on a module/page.
 * Returns true for admin, super_admin, org owner, or legacy users with no role_id.
 */
export async function canAccess(
  userId: string,
  moduleKey: string,
  pageKey: string | null,
  action: PermissionAction
): Promise<boolean> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, role_id, organization_id")
    .eq("id", userId)
    .single();

  const role = (profile as { role?: string | null } | null)?.role ?? null;
  const roleId = (profile as { role_id?: string | null } | null)?.role_id ?? null;
  const orgId = (profile as { organization_id?: string | null } | null)?.organization_id ?? null;

  if (hasFullAccess(role)) return true;

  const { data: org } = await supabase
    .from("organizations")
    .select("created_by")
    .eq("id", orgId ?? "")
    .single();
  if ((org as { created_by?: string | null } | null)?.created_by === userId) return true;

  if (!roleId) return true;

  const permMap = await getPermissionMap(userId, roleId, orgId);

  const pageKeyNorm = pageKey ?? "";
  const perm = permMap.get(`${moduleKey}:${pageKeyNorm}`);
  const modulePerm = permMap.get(`${moduleKey}:`);

  if (modulePerm?.is_full) return true;
  if (hasPermission(perm ?? modulePerm, action, false)) return true;
  return false;
}

/**
 * Check if user can access a route (by pathname). Uses getRoutePermissions to resolve
 * (moduleKey, pageKey) pairs and grants if any grants the action.
 */
export async function canAccessRoute(
  userId: string,
  pathname: string,
  action: PermissionAction = "view"
): Promise<boolean> {
  const pairs = getRoutePermissions(pathname);
  for (const { moduleKey, pageKey } of pairs) {
    if (await canAccess(userId, moduleKey, pageKey, action)) return true;
  }
  return false;
}

type ProfileForNav = { role?: string | null; role_id?: string | null; organization_id?: string | null };

/**
 * Filter nav items by user permissions. Uses role_permissions when role_id is set;
 * falls back to role-based filtering for legacy users.
 * Pass profile to avoid a duplicate fetch when the layout already has it.
 */
export async function getNavForUser(
  userId: string,
  profile?: ProfileForNav | null
): Promise<MainNavItemSerialized[]> {
  let role: string | null;
  let roleId: string | null;
  let orgId: string | null;

  if (profile) {
    role = profile.role ?? null;
    roleId = profile.role_id ?? null;
    orgId = profile.organization_id ?? null;
  } else {
    const supabase = await createClient();
    const { data: p } = await supabase
      .from("profiles")
      .select("role, role_id, organization_id")
      .eq("id", userId)
      .single();
    role = (p as ProfileForNav | null)?.role ?? null;
    roleId = (p as ProfileForNav | null)?.role_id ?? null;
    orgId = (p as ProfileForNav | null)?.organization_id ?? null;
  }

  if (hasFullAccess(role)) return mainNavItems;

  let orgData: { created_by?: string | null } | null = null;
  try {
    const supabase = await createClient();
    const { data: org } = await supabase
      .from("organizations")
      .select("created_by")
      .eq("id", orgId ?? "")
      .single();
    orgData = org as { created_by?: string | null } | null;
  } catch {
    orgData = null;
  }
  if (orgData?.created_by === userId) return mainNavItems;

  if (!roleId) return mainNavItems;

  let permMap: Map<string, RolePermission>;
  try {
    permMap = await getPermissionMap(userId, roleId, orgId);
  } catch {
    return mainNavItems;
  }

  const hasView = (moduleKey: string, pageKey: string | null) => {
    const key = `${moduleKey}:${pageKey ?? ""}`;
    const modKey = `${moduleKey}:`;
    const perm = permMap.get(key);
    const modulePerm = permMap.get(modKey);
    if (modulePerm?.is_full) return true;
    return (perm ?? modulePerm)?.can_view ?? false;
  };

  const canManageRoles = hasFullAccess(role) || orgData?.created_by === userId;

  const filtered: MainNavItemSerialized[] = [];
  for (let i = 0; i < mainNavItems.length; i++) {
    const item = mainNavItems[i];
    const node = permissionTree[i];
    const moduleKey = node?.moduleKey ?? item.href.replace(/^\/dashboard\/?/, "").split("/")[0] ?? "dashboard";
    const subItems = item.subItems.filter((sub) => {
      const pageKey = sub.href === item.href || sub.href === item.href + "/" ? "overview" : sub.href.split("/").filter(Boolean).pop() ?? "overview";
      if ((pageKey === "roles-permissions" || pageKey === "users") && !canManageRoles) return false;
      return hasView(moduleKey, pageKey);
    });
    if (subItems.length === 0) continue;
    filtered.push({ ...item, subItems });
  }
  return filtered;
}
