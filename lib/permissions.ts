/**
 * Runtime permission checks and nav filtering.
 * Uses role_permissions across all assigned roles (profile_roles + legacy profiles.role_id);
 * falls back to legacy profiles.role for admin/super_admin.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { hasFullAccess } from "@/lib/roles";
import { mainNavItems, type MainNavItemSerialized } from "@/lib/nav-items";
import { permissionTree, getRoutePermissions, getPageKeyForNavHref } from "./permissions-config";

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

function mergePermissionRow(into: RolePermission, row: RolePermission): RolePermission {
  return {
    module_key: into.module_key,
    page_key: into.page_key,
    is_full: into.is_full || row.is_full,
    can_view: into.can_view || row.can_view,
    can_create: into.can_create || row.can_create,
    can_edit: into.can_edit || row.can_edit,
    can_delete: into.can_delete || row.can_delete,
    can_export: into.can_export || row.can_export,
  };
}

function mergePermissionRows(rows: RolePermission[]): Map<string, RolePermission> {
  const map = new Map<string, RolePermission>();
  for (const r of rows) {
    const key = `${r.module_key}:${r.page_key ?? ""}`;
    const prev = map.get(key);
    if (!prev) map.set(key, { ...r });
    else map.set(key, mergePermissionRow(prev, r));
  }
  return map;
}

/** Role ids from profile_roles for the user's current org, or legacy profiles.role_id when junction is empty. */
export async function getEffectiveRoleIds(
  supabase: SupabaseClient,
  userId: string,
  legacyRoleId: string | null | undefined
): Promise<string[]> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  const orgId = (profile as { organization_id?: string | null } | null)?.organization_id ?? null;

  if (orgId) {
    const { data: prs } = await supabase
      .from("profile_roles")
      .select("role_id")
      .eq("profile_id", userId)
      .eq("organization_id", orgId);
    const fromJoin = [...new Set((prs ?? []).map((r: { role_id: string }) => r.role_id))];
    if (fromJoin.length > 0) return fromJoin;
  }

  if (legacyRoleId) return [legacyRoleId];
  return [];
}

async function getMergedPermissionMap(roleIds: string[], orgId: string | null): Promise<Map<string, RolePermission>> {
  if (!orgId || roleIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("role_permissions")
    .select("module_key, page_key, can_view, can_create, can_edit, can_delete, can_export, is_full")
    .in("role_id", roleIds);

  const list = (rows ?? []) as RolePermission[];
  return mergePermissionRows(list);
}

function hasPermission(perm: RolePermission | undefined, action: PermissionAction): boolean {
  if (!perm) return false;
  if (perm.is_full) return true;
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
 * Returns true for admin, super_admin, org owner, or legacy users with no RBAC roles.
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
  const legacyRoleId = (profile as { role_id?: string | null } | null)?.role_id ?? null;
  const orgId = (profile as { organization_id?: string | null } | null)?.organization_id ?? null;

  if (hasFullAccess(role)) return true;

  const { data: org } = await supabase
    .from("organizations")
    .select("created_by")
    .eq("id", orgId ?? "")
    .single();
  if ((org as { created_by?: string | null } | null)?.created_by === userId) return true;

  const roleIds = await getEffectiveRoleIds(supabase, userId, legacyRoleId);
  // If no RBAC roles are assigned, default to a minimal allowlist instead of granting full access.
  // This keeps restrictions effective even when profile_roles hasn't been assigned yet.
  if (roleIds.length === 0) {
    if (action !== "view") return false;
    const pk = pageKey ?? "overview";
    const allow =
      (moduleKey === "dashboard" && pk === "overview") ||
      (moduleKey === "settings" && (pk === "overview" || pk === "organization"));
    return allow;
  }

  const permMap = await getMergedPermissionMap(roleIds, orgId);

  const pageKeyNorm = pageKey ?? "";
  const perm = permMap.get(`${moduleKey}:${pageKeyNorm}`);
  const modulePerm = permMap.get(`${moduleKey}:`);

  if (modulePerm?.is_full) return true;
  if (hasPermission(perm ?? modulePerm, action)) return true;
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

export type PageCapabilityFlags = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
};

export async function getPageCapabilityFlags(
  userId: string,
  moduleKey: string,
  pageKey: string | null
): Promise<PageCapabilityFlags> {
  const [canView, canCreate, canEdit, canDelete, canExport] = await Promise.all([
    canAccess(userId, moduleKey, pageKey, "view"),
    canAccess(userId, moduleKey, pageKey, "create"),
    canAccess(userId, moduleKey, pageKey, "edit"),
    canAccess(userId, moduleKey, pageKey, "delete"),
    canAccess(userId, moduleKey, pageKey, "export"),
  ]);
  return { canView, canCreate, canEdit, canDelete, canExport };
}

/** Merge capability flags for routes that appear under multiple modules (e.g. customer payments). */
export async function getRouteCapabilityFlags(userId: string, pathname: string): Promise<PageCapabilityFlags> {
  const pairs = getRoutePermissions(pathname);
  if (pairs.length === 0) {
    return getPageCapabilityFlags(userId, "dashboard", "overview");
  }
  let merged: PageCapabilityFlags = {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canExport: false,
  };
  for (const { moduleKey, pageKey } of pairs) {
    const f = await getPageCapabilityFlags(userId, moduleKey, pageKey);
    merged = {
      canView: merged.canView || f.canView,
      canCreate: merged.canCreate || f.canCreate,
      canEdit: merged.canEdit || f.canEdit,
      canDelete: merged.canDelete || f.canDelete,
      canExport: merged.canExport || f.canExport,
    };
  }
  return merged;
}

type ProfileForNav = { role?: string | null; role_id?: string | null; organization_id?: string | null };

/**
 * Filter nav items by user permissions. Uses merged role_permissions for all assigned roles;
 * falls back to role-based filtering for legacy users.
 * Pass profile to avoid a duplicate fetch when the layout already has it.
 */
export async function getNavForUser(
  userId: string,
  profile?: ProfileForNav | null
): Promise<MainNavItemSerialized[]> {
  let role: string | null;
  let legacyRoleId: string | null;
  let orgId: string | null;

  if (profile) {
    role = profile.role ?? null;
    legacyRoleId = profile.role_id ?? null;
    orgId = profile.organization_id ?? null;
  } else {
    const supabase = await createClient();
    const { data: p } = await supabase
      .from("profiles")
      .select("role, role_id, organization_id")
      .eq("id", userId)
      .single();
    role = (p as ProfileForNav | null)?.role ?? null;
    legacyRoleId = (p as ProfileForNav | null)?.role_id ?? null;
    orgId = (p as ProfileForNav | null)?.organization_id ?? null;
  }

  if (hasFullAccess(role)) return mainNavItems;

  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("created_by").eq("id", orgId ?? "").single();
  const orgData = org as { created_by?: string | null } | null;
  if (orgData?.created_by === userId) return mainNavItems;

  const roleIds = await getEffectiveRoleIds(supabase, userId, legacyRoleId);
  if (roleIds.length === 0) {
    // Minimal nav when RBAC roles aren't assigned yet.
    return mainNavItems
      .map((item) => {
        const keep =
          item.href === "/dashboard" ||
          item.href === "/dashboard/settings";
        if (!keep) return null;

        const subItems = item.subItems.filter((sub) => {
          const href = sub.href.replace(/\/$/, "");
          return (
            href === "/dashboard" ||
            href === "/dashboard/settings" ||
            href === "/dashboard/settings/organization"
          );
        });
        return subItems.length > 0 ? { ...item, subItems } : null;
      })
      .filter(Boolean) as MainNavItemSerialized[];
  }

  let permMap: Map<string, RolePermission>;
  try {
    permMap = await getMergedPermissionMap(roleIds, orgId);
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
      const pageKey = getPageKeyForNavHref(moduleKey, item.href, sub.href);
      if ((pageKey === "roles-permissions" || pageKey === "users") && !canManageRoles) return false;
      return hasView(moduleKey, pageKey);
    });
    if (subItems.length === 0) continue;
    filtered.push({ ...item, subItems });
  }
  return filtered;
}
