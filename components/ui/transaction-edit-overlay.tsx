"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  /** Path + query (e.g. `/dashboard/sales/customer-payments?edit=…`). Null hides overlay. */
  path: string | null;
  onClose: () => void;
};

/**
 * Full-screen stack above modals (z-100+) so parent dialogs stay mounted.
 * Same pattern as cash report ledger → edit flow.
 */
export function TransactionEditOverlay({ path, onClose }: Props) {
  const src =
    path != null && typeof window !== "undefined" ? new URL(path, window.location.origin).href : null;

  useEffect(() => {
    if (!path) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "close-overlay") onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onMessage);
    };
  }, [path, onClose]);

  if (!path || !src || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/50 print:hidden"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit transaction"
        className="fixed left-1/2 top-1/2 z-[101] flex h-[min(92vh,920px)] w-[min(96vw,1120px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl print:hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5 text-[var(--navbar-foreground)]"
          style={{ backgroundColor: "var(--navbar)" }}
        >
          <span className="text-sm font-semibold">
            {path?.startsWith("/invoice/") ? "Edit Sales Invoice" : path?.startsWith("/payment/") ? "Edit Payment" : "Edit Transaction"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-white/40 bg-white/10 text-navbar-foreground hover:bg-white/20"
            onClick={onClose}
          >
            <X className="mr-1 h-4 w-4" />
            Close
          </Button>
        </div>
        <iframe key={src} title="Edit transaction" className="min-h-0 w-full flex-1 border-0 bg-background" src={src} />
      </div>
    </>,
    document.body
  );
}
