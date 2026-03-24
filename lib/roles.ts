/**
 * Role definitions for the application.
 * Used for nav filtering, user assignment, and permission checks.
 */

export const ROLE_OPTIONS = [
  { value: "platform_admin", label: "Platform Admin" },
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "sales", label: "Sales" },
  { value: "purchasing", label: "Purchasing" },
  { value: "inventory", label: "Inventory" },
  { value: "accounting", label: "Accounting" },
  { value: "hr", label: "HR" },
] as const;

export type RoleValue = (typeof ROLE_OPTIONS)[number]["value"];

/** Roles that bypass nav filtering and see all modules. */
export const FULL_ACCESS_ROLES: RoleValue[] = ["platform_admin", "super_admin", "admin", "member"];

export function hasFullAccess(role: string | null | undefined): boolean {
  const r = (role ?? "").toLowerCase();
  return FULL_ACCESS_ROLES.includes(r as RoleValue);
}
