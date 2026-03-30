"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type MultiSelectItem = { id: string; label: string };

type Props = {
  items: MultiSelectItem[];
  /** Selected ids in display order (last added is typically most relevant for pickers). */
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
};

export function MultiSelectSearch({
  items,
  value,
  onChange,
  placeholder = "Search…",
  className,
  id,
  "aria-label": ariaLabel,
  disabled = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) m.set(it.id, it.label);
    return m;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (value.includes(it.id)) return false;
      if (!q) return true;
      return it.label.toLowerCase().includes(q);
    });
  }, [items, value, query]);

  const add = useCallback(
    (itemId: string) => {
      if (disabled) return;
      if (value.includes(itemId)) return;
      onChange([...value, itemId]);
      setQuery("");
    },
    [disabled, value, onChange]
  );

  const remove = useCallback(
    (itemId: string) => {
      if (disabled) return;
      onChange(value.filter((id) => id !== itemId));
    },
    [disabled, value, onChange]
  );

  const clearAll = useCallback(() => {
    if (disabled) return;
    onChange([]);
    setQuery("");
  }, [disabled, onChange]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1",
          disabled && "pointer-events-none cursor-not-allowed opacity-60"
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        {value.map((itemId) => (
          <span
            key={itemId}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm"
          >
            <span className="truncate" title={labelById.get(itemId) ?? itemId}>
              {labelById.get(itemId) ?? itemId}
            </span>
            <button
              type="button"
              onClick={() => remove(itemId)}
              className="shrink-0 rounded p-0.5 hover:bg-background/80"
              aria-label={`Remove ${labelById.get(itemId) ?? itemId}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          autoComplete="off"
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => !disabled && setOpen(true)}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-[6rem] flex-1 border-0 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear all"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {!disabled && open && filtered.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full z-30 mt-0.5 max-h-40 overflow-auto rounded-md border border-input bg-background py-1 shadow-md"
          role="listbox"
        >
          {filtered.map((it) => (
            <li key={it.id} role="option">
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  add(it.id);
                  setOpen(true);
                }}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
