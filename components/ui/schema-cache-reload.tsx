"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function isSchemaCacheError(error: string | null): boolean {
  return Boolean(error?.toLowerCase().includes("schema cache"));
}

export function SchemaCacheReloadButton({
  error,
  onReloaded,
  className,
}: {
  error: string | null;
  onReloaded?: () => void;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  if (!isSchemaCacheError(error)) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      className={className}
      onClick={async () => {
        setPending(true);
        try {
          const res = await fetch("/api/admin/reload-schema", { method: "POST" });
          const data = await res.json();
          if (res.ok && data.ok) {
            onReloaded?.();
            window.location.reload();
          }
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? "Reloading…" : "Reload schema"}
    </Button>
  );
}
