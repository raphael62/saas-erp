"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled && session) setReady(true);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: uErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (uErr) {
      setError(uErr.message);
      return;
    }
    await supabase.auth.signOut();
    setSuccess(true);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2">
          <Layers className="h-8 w-8 text-foreground" strokeWidth={2} />
          <h1 className="text-2xl font-semibold">Set new password</h1>
        </div>
        {success ? (
          <div className="space-y-4 text-center text-sm">
            <p className="text-muted-foreground">Your password was updated. Sign in with your company code and email.</p>
            <Link href="/login" className="font-medium text-foreground underline">
              Go to log in
            </Link>
          </div>
        ) : !ready ? (
          <p className="text-center text-sm text-muted-foreground">Checking your reset link…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="pw" className="mb-1 block text-sm font-medium">
                New password
              </label>
              <input
                id="pw"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="pw2" className="mb-1 block text-sm font-medium">
                Confirm password
              </label>
              <input
                id="pw2"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-foreground py-2 font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save password"}
            </button>
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="underline">
                Cancel
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
