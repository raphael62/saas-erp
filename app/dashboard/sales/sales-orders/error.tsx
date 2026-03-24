"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function SalesOrdersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Sales Orders error:", error);
  }, [error]);

  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
      <h2 className="text-lg font-semibold text-destructive">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Button
        onClick={reset}
        variant="outline"
        className="mt-4"
      >
        Try again
      </Button>
    </div>
  );
}
