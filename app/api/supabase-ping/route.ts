import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PING_TIMEOUT_MS = 5000;

export async function GET() {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), PING_TIMEOUT_MS)
  );

  try {
    const supabase = await createClient();
    const { data } = await Promise.race([
      supabase.auth.getUser(),
      timeout,
    ]) as { data: { user: unknown } };

    return NextResponse.json({
      ok: true,
      hasUser: !!data?.user,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 503 }
    );
  }
}
