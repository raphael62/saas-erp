"use server";

import { createClient } from "@supabase/supabase-js";

/**
 * Sends Supabase "reset password" email. Does not reveal whether the email exists.
 */
export async function requestPasswordReset(email: string): Promise<{ error?: string }> {
  const trimmed = email?.trim().toLowerCase();
  if (!trimmed) return { error: "Email is required" };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  if (!url || !anon) return { error: "Auth is not configured." };

  const supabase = createClient(url, anon);
  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo: `${appUrl}/auth/update-password`,
  });
  if (error) return { error: error.message };
  return {};
}
