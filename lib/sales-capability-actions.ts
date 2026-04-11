"use server";

import { createClient } from "@/lib/supabase/server";
import { getRouteCapabilityFlags, type PageCapabilityFlags } from "@/lib/permissions";

export async function getSalesAreaCapabilityFlags(pathname: string): Promise<PageCapabilityFlags | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  return getRouteCapabilityFlags(user.id, pathname);
}
