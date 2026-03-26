import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ThemeAppearanceForm } from "@/components/settings/theme-appearance-form";
import { isValidThemeAccentHex } from "@/lib/theme-accent";

export default async function AppearanceSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let themeHex: string | null = null;
  const sel = await supabase.from("profiles").select("theme_accent_hex").eq("id", user.id).maybeSingle();
  if (!sel.error) {
    const raw = (sel.data as { theme_accent_hex?: string | null } | null)?.theme_accent_hex ?? null;
    themeHex = raw && isValidThemeAccentHex(raw) ? raw.toLowerCase() : null;
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/settings" className="hover:text-foreground">
          Preferences
        </Link>
        <span>/</span>
        <span className="text-foreground">Appearance</span>
      </div>
      <h1 className="text-xl font-semibold">Theme color</h1>
      <p className="mt-1 text-sm text-muted-foreground">Personal accent for the dashboard header.</p>
      <ThemeAppearanceForm initialHex={themeHex} />
    </div>
  );
}
