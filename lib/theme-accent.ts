import type { CSSProperties } from "react";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function isValidThemeAccentHex(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

/** Returns normalized #rrggbb or null if invalid / empty. */
export function normalizeThemeAccentHex(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const withHash = v.startsWith("#") ? v : `#${v}`;
  if (!HEX_RE.test(withHash)) return null;
  return withHash.toLowerCase();
}

/** Readable text on top of navbar background (WCAG-inspired luminance). */
export function contrastingNavbarForeground(bgHex: string): string {
  const h = bgHex.startsWith("#") ? bgHex.slice(1) : bgHex;
  if (h.length !== 6) return "#f8fafc";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "#f8fafc";
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return l > 0.55 ? "#0f172a" : "#f8fafc";
}

export function dashboardAccentCssVars(hex: string | null | undefined): CSSProperties | undefined {
  if (!hex || !isValidThemeAccentHex(hex)) return undefined;
  return {
    "--navbar": hex,
    "--navbar-foreground": contrastingNavbarForeground(hex),
  } as CSSProperties;
}
