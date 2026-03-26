"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { resetThemeAccent, updateThemeAccentHex } from "@/app/dashboard/settings/appearance/actions";
import { isValidThemeAccentHex } from "@/lib/theme-accent";

const PRESETS: { hex: string; label: string }[] = [
  { hex: "#b91c1c", label: "Red" },
  { hex: "#c2410c", label: "Orange" },
  { hex: "#ca8a04", label: "Amber" },
  { hex: "#16a34a", label: "Green" },
  { hex: "#0d9488", label: "Teal" },
  { hex: "#2563eb", label: "Blue" },
  { hex: "#7c3aed", label: "Violet" },
  { hex: "#9333ea", label: "Purple" },
  { hex: "#db2777", label: "Pink" },
  { hex: "#475569", label: "Slate" },
  { hex: "#0f766e", label: "Cyan" },
  { hex: "#854d0e", label: "Brown" },
];

type Props = {
  initialHex: string | null;
};

export function ThemeAppearanceForm({ initialHex }: Props) {
  const router = useRouter();
  const defaultPicker = initialHex && isValidThemeAccentHex(initialHex) ? initialHex : "#b91c1c";
  const [hex, setHex] = useState(defaultPicker);
  const [pending, setPending] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialHex && isValidThemeAccentHex(initialHex)) setHex(initialHex);
    else setHex("#b91c1c");
  }, [initialHex]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending("save");
    const fd = new FormData();
    fd.set("theme_accent_hex", hex);
    const { error: err } = await updateThemeAccentHex(fd);
    setPending(null);
    if (err) {
      setError(err);
      return;
    }
    router.refresh();
  }

  async function handleReset() {
    setError(null);
    setPending("reset");
    const { error: err } = await resetThemeAccent();
    setPending(null);
    if (err) {
      setError(err);
      return;
    }
    setHex("#b91c1c");
    router.refresh();
  }

  return (
    <div className="mt-6 max-w-lg space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Chooses the color of the top navigation bar and related accents. Saved to your profile so it follows you on
          this browser session after sign-in.
        </p>

        <form onSubmit={handleSave} className="mt-6 space-y-5">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="theme_accent_hex" className="mb-2 block text-sm font-medium">
                Custom color
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="theme_accent_hex"
                  type="color"
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  className="h-11 w-14 cursor-pointer rounded border border-input bg-background p-1"
                  aria-label="Pick accent color"
                />
                <span className="font-mono text-sm text-muted-foreground">{hex.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Presets</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  title={p.label}
                  onClick={() => setHex(p.hex)}
                  className="h-9 w-9 rounded-md border-2 border-border shadow-sm ring-offset-2 transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ backgroundColor: p.hex }}
                  aria-label={p.label}
                />
              ))}
            </div>
          </div>

          <div
            className="rounded-md border border-white/20 px-4 py-3 text-sm font-medium"
            style={{ backgroundColor: "var(--navbar)", color: "var(--navbar-foreground)" }}
          >
            Preview — top bar uses your current dashboard theme. Save to apply everywhere after refresh.
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending !== null} className="bg-[var(--navbar)] text-[var(--navbar-foreground)] hover:opacity-90">
              {pending === "save" ? "Saving…" : "Save color"}
            </Button>
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void handleReset()}>
              {pending === "reset" ? "Resetting…" : "Use app default"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
