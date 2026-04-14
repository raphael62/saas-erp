"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
          <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
            <h1 className="text-lg font-semibold text-destructive">Application error</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {error.message || "A critical error occurred. Please reload the page."}
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-4 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
