const POS_PARKED_PREFIX = "pos-parked-";

/**
 * Human-readable parked sale reference: `yyyy-mm-dd-xxx` where `xxx` is a 3-digit suffix derived from the cart id.
 */
export function formatParkedSaleReceiptNo(saleDateYmd: string | null | undefined, cartIdOrStorageKey: string): string {
  let dateStr = String(saleDateYmd ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    dateStr = new Date().toISOString().slice(0, 10);
  }

  let raw = String(cartIdOrStorageKey ?? "").trim();
  if (raw.startsWith(POS_PARKED_PREFIX)) {
    raw = raw.slice(POS_PARKED_PREFIX.length);
  }

  const hex = raw.replace(/-/g, "");
  let seq = 0;
  if (/^[0-9a-f]{8,}$/i.test(hex)) {
    seq = parseInt(hex.slice(-8), 16) % 1000;
  } else {
    const ts = parseInt(raw, 10);
    if (Number.isFinite(ts) && ts > 0) {
      seq = ts % 1000;
    } else {
      seq = hex.split("").reduce((a, c) => (a + c.charCodeAt(0)) % 1000, 0);
    }
  }

  return `${dateStr}-${String(seq).padStart(3, "0")}`;
}
