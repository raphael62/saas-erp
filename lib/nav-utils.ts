import { mainNavItems, type MainNavItem } from "@/components/dashboard/nav-config";

/**
 * Filter nav items by user role. admin, member, and null/undefined see all.
 * See docs/RULES.md for role definitions.
 */
export function getNavItemsForRole(role: string | null | undefined): MainNavItem[] {
  const r = (role ?? "member").toLowerCase();
  if (r === "admin" || r === "member") return mainNavItems;
  return mainNavItems.filter((item) => {
    const allowed = item.allowedRoles;
    if (!allowed || allowed.length === 0) return true;
    return allowed.includes(r);
  });
}
