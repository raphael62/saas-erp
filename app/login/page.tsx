"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { validateLoginWithCode } from "./actions";

function LoginForm() {
  const [companyCode, setCompanyCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "auth") setError("Authentication failed. Please try again.");
    if (err === "supabase_timeout")
      setError("Connection to database timed out. Check your Supabase project and network, then try again.");
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      const userId = signInData?.user?.id;
      if (!userId) {
        setError("Sign-in failed.");
        return;
      }

      const result = await validateLoginWithCode(companyCode.trim(), userId, signInData.user?.email ?? "");
      if (!result.ok) {
        await supabase.auth.signOut();
        setError(result.error);
        return;
      }

      window.location.href = "/dashboard";
      return;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Sign-in failed. Check your connection and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2">
          <Layers className="h-8 w-8 text-foreground" strokeWidth={2} />
          <h1 className="text-2xl font-semibold">Log in</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="companyCode" className="mb-1 block text-sm font-medium">
              Company code
            </label>
            <input
              id="companyCode"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm tracking-wider"
              autoComplete="off"
            />
            <p className="mt-0.5 text-xs text-muted-foreground">6-digit code from registration (same for your whole team)</p>
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
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center p-8">
          <div className="max-w-sm animate-pulse space-y-6">
            <div className="h-8 rounded bg-muted" />
            <div className="space-y-4">
              <div className="h-10 rounded bg-muted" />
              <div className="h-10 rounded bg-muted" />
              <div className="h-10 rounded bg-muted" />
            </div>
          </div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
