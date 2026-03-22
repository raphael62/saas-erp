/**
 * When navigating from Supplier Statement via router.push(?edit=…), Next.js can
 * remount or hydrate in an order where the query is briefly missing and the
 * form never opens. Queue the target here and consume on the destination page.
 */
const STORAGE_KEY = "masterbooks-erp:supplier-statement-edit-v1";
const MAX_AGE_MS = 120_000;

type Stored = { href: string; ts: number };

export function queueSupplierStatementEditNavigation(href: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ href, ts: Date.now() } satisfies Stored));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Edit id to open, or null. Does not clear storage if invoice not in list yet. */
export function peekSupplierStatementEditForCurrentPage(): string | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  let parsed: Stored;
  try {
    parsed = JSON.parse(raw) as Stored;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
  if (!parsed?.href || typeof parsed.ts !== "number") {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
  if (Date.now() - parsed.ts > MAX_AGE_MS) {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
  try {
    const u = new URL(parsed.href, window.location.origin);
    if (u.pathname !== window.location.pathname) return null;
    const edit = u.searchParams.get("edit");
    return typeof edit === "string" && edit.trim() !== "" ? edit.trim() : null;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearSupplierStatementEditQueue() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
