import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Triggers PostgREST schema cache reload. Use after running migrations
 * when new tables aren't visible to the API.
 * Only available when DEV_BYPASS_ORG is set (dev mode).
 */
export async function POST() {
  if (!process.env.DEV_BYPASS_ORG) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc("reload_postgrest_schema");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, message: "Schema reload triggered" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
