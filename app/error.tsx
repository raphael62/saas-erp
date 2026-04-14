"use client";

import { useEffect } from "react";

/** Keep this file free of `@/` imports so error-page compilation cannot fail on alias/ui. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
      <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/40">
        <h1 className="text-lg font-semibold text-red-800 dark:text-red-200">Something went wrong</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          type="button"
          className="mt-4 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          onClick={() => reset()}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
