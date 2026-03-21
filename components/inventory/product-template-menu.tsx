"use client";

import { useEffect, useRef } from "react";

type ProductTemplateMenuProps = {
  open: boolean;
  onClose: () => void;
  onOpenTemplateSettings: () => void;
  onOpenTemplateList: () => void;
};

export function ProductTemplateMenu({
  open,
  onClose,
  onOpenTemplateSettings,
  onOpenTemplateList,
}: ProductTemplateMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-10 z-50 min-w-56 rounded border border-border bg-background p-1 shadow-lg"
    >
      <button
        type="button"
        className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted"
        onClick={() => {
          onOpenTemplateSettings();
          onClose();
        }}
      >
        Template Settings
      </button>
      <button
        type="button"
        className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted"
        onClick={() => {
          onOpenTemplateList();
          onClose();
        }}
      >
        Template List
      </button>
    </div>
  );
}

