/**
 * Platform admin / developer access.
 * These users bypass organization scoping and can access all forms and designs.
 * Configure via PLATFORM_ADMIN_EMAILS (comma-separated) in .env.local
 */

function getEmails(): string[] {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const list = getEmails();
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}

/** When set to "1", bypasses org/company code for any authenticated user (local dev only). */
export function isDevBypassEnabled(): boolean {
  return process.env.DEV_BYPASS_ORG === "1";
}
