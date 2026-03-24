/**
 * Detect PostgREST/table errors that indicate a table is unavailable.
 * "does not exist" = table not in DB. "schema cache" = table exists but PostgREST hasn't loaded it.
 */
export function isTableUnavailableError(err: { message?: string } | null): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
}

export function isSchemaCacheError(err: { message?: string } | null): boolean {
  if (!err?.message) return false;
  return err.message.toLowerCase().includes("schema cache");
}
