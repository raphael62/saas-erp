"use client";

import { useState } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import { requestPasswordReset } from "@/app/auth/actions";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await requestPasswordReset(email);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setDone(true);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2">
          <Layers className="h-8 w-8 text-foreground" strokeWidth={2} />
          <h1 className="text-2xl font-semibold">Forgot password</h1>
        </div>
        {done ? (
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              If an account exists for that email, we sent a link to reset your password. Check your inbox and spam folder.
            </p>
            <p>You will need your <strong className="text-foreground">company code</strong> when you sign in again.</p>
            <Link href="/login" className="block text-center text-sm font-medium text-foreground underline">
              Back to log in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter your email. We will send a link to set a new password.
            </p>
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-foreground py-2 font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="underline">
                Back to log in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
