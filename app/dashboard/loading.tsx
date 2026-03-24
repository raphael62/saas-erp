"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function DashboardLoading() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
      {slow && (
        <div className="max-w-xs rounded-lg border border-amber-200 bg-amber-50 p-4 text-center text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <p className="font-medium text-amber-800 dark:text-amber-200">Taking longer than expected?</p>
          <p className="mt-1 text-amber-700 dark:text-amber-300">
            Check your network and Supabase connection.
          </p>
          <div className="mt-3 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
            >
              Retry
            </button>
            <Link
              href="/login"
              className="rounded-md border border-amber-600 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/50"
            >
              Back to login
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
