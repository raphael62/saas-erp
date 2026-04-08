/** Encode filter values that may contain commas into a single query param */
export function encodeCsvTerms(values: string[]): string {
  return values.map((v) => encodeURIComponent(v.trim())).join(",");
}

export function decodeCsvTerms(s: string | undefined): string[] {
  if (!s || typeof s !== "string") return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
}

export function parseIdList(s: string | undefined): string[] {
  if (!s || typeof s !== "string") return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
