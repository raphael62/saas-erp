import Link from "next/link";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RegisterBillingSignOutButton } from "@/components/register/register-billing-sign-out-button";

export default async function RegisterBillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params.session_id;
  const sessionId = Array.isArray(raw) ? raw[0] : raw;
  if (!sessionId) redirect("/register");

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) redirect("/register");

  const stripe = new Stripe(stripeKey);
  let orgIdFromSession: string | null = null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status !== "complete") redirect("/register");
    orgIdFromSession = session.client_reference_id ?? session.metadata?.organization_id ?? null;
  } catch {
    redirect("/register");
  }

  if (!orgIdFromSession) redirect("/register");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/register/billing-success?session_id=" + sessionId)}`);

  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  const userOrg = (profile as { organization_id?: string | null } | null)?.organization_id;
  if (!userOrg || userOrg !== orgIdFromSession) {
    redirect("/dashboard");
  }

  const { data: org } = await supabase.from("organizations").select("code").eq("id", orgIdFromSession).maybeSingle();
  const code = (org as { code?: string } | null)?.code ?? "—";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <Layers className="h-8 w-8 text-foreground" strokeWidth={2} />
          <h1 className="text-2xl font-semibold">Trial started</h1>
          <p className="text-sm text-muted-foreground">
            Your 14-day trial is active. You will not be charged until the trial ends; you can cancel anytime before then in
            the Stripe billing portal (or your account settings when linked).
          </p>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Company code (needed at login)</p>
          <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3">
            <span className="font-mono text-lg font-semibold tracking-wider">{code}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Save this code. Then sign out and log in with company code, email, and password.
        </p>
        <RegisterBillingSignOutButton loginHref="/login" />
        <Link href="/dashboard" className="block text-sm text-muted-foreground underline hover:text-foreground">
          Stay signed in and go to dashboard
        </Link>
      </div>
    </main>
  );
}
