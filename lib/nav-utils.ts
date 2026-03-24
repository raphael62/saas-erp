import { mainNavItems, type MainNavItemSerialized } from "@/lib/nav-items";
import { hasFullAccess } from "@/lib/roles";

/**
 * Filter nav items by user role. super_admin, admin, member, and null/undefined see all.
 * See docs/RULES.md for role definitions.
 */
export function getNavItemsForRole(role: string | null | undefined): MainNavItemSerialized[] {
  if (hasFullAccess(role ?? "member")) return mainNavItems;
  const r = (role ?? "member").toLowerCase();
  return mainNavItems.filter((item) => {
    const allowed = item.allowedRoles;
    if (!allowed || allowed.length === 0) return true;
    return allowed.includes(r);
  });
}
