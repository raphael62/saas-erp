export type CsvRow = Record<string, string>;

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells.map((v) => v.replace(/^"(.*)"$/, "$1").trim());
}

export function parseCsv(text: string): CsvRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    if (values.every((v) => !v)) continue;
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return rows;
}

export function parseBool(value: string | null | undefined, fallback = false): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return fallback;
  if (["1", "true", "yes", "y", "active", "inc"].includes(v)) return true;
  if (["0", "false", "no", "n", "inactive", "exc"].includes(v)) return false;
  return fallback;
}

export function parseNumber(value: string | null | undefined, fallback = 0): number {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
