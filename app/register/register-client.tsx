"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Layers, Copy, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createRegistrationCheckoutSession,
  getStripeBillingConfigured,
} from "@/app/register/actions";
import {
  SUBSCRIPTION_TIER_OPTIONS,
  type SubscriptionTierId,
} from "@/lib/subscription-tiers";

function RegisterFlow() {
  const searchParams = useSearchParams();
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedTier, setSelectedTier] = useState<SubscriptionTierId>("starter");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [companyCode, setCompanyCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [billingCanceled, setBillingCanceled] = useState(false);
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (searchParams.get("billing") === "canceled") setBillingCanceled(true);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await getStripeBillingConfigured();
      if (!cancelled) setStripeReady(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setCompanyCode(null);
    setBillingCanceled(false);
    try {
      const supabase = createClient();

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/auth/callback`,
          data: { full_name: fullName.trim() || undefined },
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (!signUpData.session) {
        setError(
          "No login session yet — usually because email confirmation is still ON in Supabase. " +
            "Dashboard → Authentication → Providers → Email → turn OFF “Confirm email”, then try again."
        );
        return;
      }

      const { data: regData, error: regError } = await supabase.rpc("start_registration", {
        p_company_name: companyName.trim(),
        p_phone: phone.trim() || null,
        p_subscription_tier: selectedTier,
      });
      if (regError) {
        setError(regError.message);
        return;
      }
      const orgId = (regData as { org_id?: string } | null)?.org_id;
      const code = (regData as { code?: string } | null)?.code;
      if (!orgId || !code) {
        setError("Registration failed. Please try again.");
        return;
      }

      const { error: completeError } = await supabase.rpc("complete_registration", {
        p_org_id: orgId,
      });
      if (completeError) {
        setError(
          `${completeError.message} If this continues, apply the latest Supabase migrations for registration RPCs.`
        );
        return;
      }

      const billingOk = await getStripeBillingConfigured();
      if (billingOk) {
        const { url, error: checkoutError } = await createRegistrationCheckoutSession(selectedTier);
        if (checkoutError) {
          setError(checkoutError);
          return;
        }
        if (url) {
          window.location.href = url;
          return;
        }
      }

      try {
        await supabase.auth.signOut();
      } catch {
        /* still show code */
      }
      setCompanyCode(code);
    } finally {
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!companyCode) return;
    await navigator.clipboard.writeText(companyCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (companyCode) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-2">
            <Layers className="h-8 w-8 text-foreground" strokeWidth={2} />
            <h1 className="text-2xl font-semibold">Account created</h1>
            <p className="text-center text-sm text-muted-foreground">
              You have been signed out so you can log in the usual way. This is your{" "}
              <strong className="text-foreground">company code</strong> — use it with your email and password on the next
              screen.
            </p>
            {!stripeReady && (
              <p className="text-center text-xs text-amber-800 dark:text-amber-200">
                Stripe Price IDs are not configured — subscription checkout was skipped. Set env vars to require billing at
                signup.
              </p>
            )}
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3">
              <span className="font-mono text-lg font-semibold tracking-wider">{companyCode}</span>
              <button
                type="button"
                onClick={copyCode}
                className="rounded p-1.5 hover:bg-muted"
                aria-label="Copy code"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Save it somewhere safe. If you lose it, an admin can find it in Supabase → Table Editor →{" "}
              <code className="text-xs">organizations</code> → column <code className="text-xs">code</code>.
            </p>
            <Link
              href="/login"
              className="mt-6 w-full rounded-md bg-foreground py-2 text-center font-medium text-background hover:opacity-90"
            >
              Go to log in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center justify-center gap-2">
          <Layers className="h-8 w-8 text-foreground" strokeWidth={2} />
          <h1 className="text-2xl font-semibold">Sign up</h1>
        </div>
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Choose a plan (14-day trial, no charge until the trial ends — you can cancel before then). After signup you may be
          redirected to secure checkout to save a payment method. Then save your <strong className="text-foreground">6-digit company code</strong> for login.
        </p>
        {billingCanceled && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            Checkout was canceled. You are still signed in — submit the form again to retry, or log out and start over from the
            login page.
          </p>
        )}
        {stripeReady === false && (
          <p className="text-xs text-muted-foreground">
            Stripe Price IDs are not set in the server environment — after account creation you will skip checkout and only
            see your company code (for local/dev).
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Plan</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUBSCRIPTION_TIER_OPTIONS.map((t) => (
                <label
                  key={t.id}
                  className={`flex cursor-pointer flex-col rounded-md border px-3 py-2 text-sm transition-colors ${
                    selectedTier === t.id
                      ? "border-foreground bg-muted/50"
                      : "border-border hover:bg-muted/30"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="tier"
                      value={t.id}
                      checked={selectedTier === t.id}
                      onChange={() => setSelectedTier(t.id)}
                      className="shrink-0"
                    />
                    <span className="font-medium">{t.name}</span>
                  </span>
                  <span className="mt-1 pl-6 text-xs text-muted-foreground">{t.blurb}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="company" className="mb-1 block text-sm font-medium">
              Company / Organization name
            </label>
            <input
              id="company"
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Inc"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-medium text-muted-foreground">
              Phone (optional)
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 234 567 8900"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-muted-foreground">
              Your name (optional)
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-foreground py-2 font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function RegisterClient() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      }
    >
      <RegisterFlow />
    </Suspense>
  );
}
