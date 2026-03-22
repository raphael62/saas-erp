"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function POSSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("POS section error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        {error.message}
      </p>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}
