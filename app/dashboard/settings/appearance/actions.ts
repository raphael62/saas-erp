"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { normalizeThemeAccentHex } from "@/lib/theme-accent";

export async function updateThemeAccentHex(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const raw = (formData.get("theme_accent_hex") as string) ?? "";
  const normalized = normalizeThemeAccentHex(raw);

  const { error } = await supabase
    .from("profiles")
    .update({
      theme_accent_hex: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error?.message?.includes("theme_accent_hex")) {
    return { error: "Theme column missing. Apply migration 042_profiles_theme_accent_hex.sql in Supabase." };
  }
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings/appearance");
  return {};
}

export async function resetThemeAccent(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("profiles")
    .update({
      theme_accent_hex: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error?.message?.includes("theme_accent_hex")) {
    return { error: "Theme column missing. Apply migration 042_profiles_theme_accent_hex.sql in Supabase." };
  }
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings/appearance");
  return {};
}
