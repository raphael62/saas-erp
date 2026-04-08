"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, List, Minus, Pin, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ErpSearchGridRow = {
  id: string;
  typeLabel: string;
  cells: string[];
  isInactive?: boolean;
};

type ErpMultiSelectSearchModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  columnLabels: string[];
  rows: ErpSearchGridRow[];
  selectedIds: Set<string>;
  onApply: (next: Set<string>) => void;
  showIncludeInactive?: boolean;
  includeInactiveDefault?: boolean;
  searchPlaceholder?: string;
  /** Hide the Type column (default true — all search popups omit it). */
  hideTypeColumn?: boolean;
  /** Per data column (same length as columnLabels). Overrides default min-w on headers/cells. */
  columnClassNames?: string[];
  /**
   * `center` — viewport-centered (default).
   * `side` — docked to the right edge so it sits beside a centered filter dialog; rendered in a portal
   * so `position: fixed` is not trapped inside a transformed parent.
   */
  panelPlacement?: "center" | "side";
};

const HEADER_BAR = "text-white";
const BTN_ICON = "rounded p-1.5 text-white hover:bg-white/15";
const NAV = { backgroundColor: "var(--navbar)" } as const;

export function ErpMultiSelectSearchModal({
  open,
  onOpenChange,
  title,
  columnLabels,
  rows,
  selectedIds,
  onApply,
  showIncludeInactive = false,
  includeInactiveDefault = true,
  searchPlaceholder = "Input and press [Enter]",
  hideTypeColumn = true,
  columnClassNames,
  panelPlacement = "center",
}: ErpMultiSelectSearchModalProps) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(includeInactiveDefault);

  useEffect(() => {
    if (!open) return;
    setDraft(new Set(selectedIds));
    setSearch("");
    setIncludeInactive(includeInactiveDefault);
  }, [open, selectedIds, includeInactiveDefault]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (showIncludeInactive && !includeInactive && r.isInactive) return false;
      if (!q) return true;
      const parts = hideTypeColumn ? r.cells : [r.typeLabel, ...r.cells];
      const hay = parts.join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, includeInactive, showIncludeInactive, hideTypeColumn]);

  const allVisibleSelected = useMemo(() => {
    if (filtered.length === 0) return false;
    return filtered.every((r) => draft.has(r.id));
  }, [filtered, draft]);

  const someVisibleSelected = useMemo(
    () => filtered.some((r) => draft.has(r.id)),
    [filtered, draft]
  );

  const headerSelectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = headerSelectAllRef.current;
    if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected]);

  const toggleHeader = useCallback(() => {
    if (allVisibleSelected) {
      setDraft((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setDraft((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.add(r.id));
        return next;
      });
    }
  }, [allVisibleSelected, filtered]);

  const toggleRow = useCallback((id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    onApply(new Set(draft));
    onOpenChange(false);
  }, [draft, onApply, onOpenChange]);

  const handleRefresh = useCallback(() => {
    setDraft(new Set(selectedIds));
    setSearch("");
  }, [selectedIds]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        handleApply();
      }
      if (e.key === "F3") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleApply]);

  if (!open) return null;

  const tableColSpan = 2 + columnLabels.length + (hideTypeColumn ? 0 : 1);

  /** Right edge of centered filter (min 560px / full width) + 6px gap — not pinned to viewport right. */
  const sidePanelClass =
    "fixed left-[calc(50%+min(280px,calc((100vw-1rem)/2))+0.375rem)] top-1/2 z-[61] flex max-h-[min(88vh,900px)] w-[min(460px,max(11.25rem,calc(50vw-0.375rem-min(280px,calc((100vw-1rem)/2)))))] -translate-y-1/2 flex-col overflow-hidden rounded-md border border-border bg-background shadow-[0_12px_40px_rgb(0_0_0/0.18)]";

  const panelClass =
    panelPlacement === "side"
      ? sidePanelClass
      : "fixed left-1/2 top-1/2 z-[61] flex max-h-[min(88vh,900px)] w-[min(460px,calc(50vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-md border border-border bg-background shadow-[0_12px_40px_rgb(0_0_0/0.18)]";

  const content = (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/45"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="erp-ms-title"
        className={panelClass}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={cn("flex shrink-0 items-center justify-between px-3 py-2", HEADER_BAR)} style={NAV}>
          <h2 id="erp-ms-title" className="text-sm font-semibold tracking-tight">
            {title}
          </h2>
          <div className="flex items-center gap-0.5">
            <button type="button" className={BTN_ICON} aria-label="Pin" title="Pin">
              <Pin className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={BTN_ICON}
              aria-label="Refresh"
              title="Refresh"
              onClick={handleRefresh}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={BTN_ICON}
              aria-label="Minimize"
              title="Minimize"
              onClick={() => onOpenChange(false)}
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={BTN_ICON}
              aria-label="Close"
              title="Close"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-sm">
          <p className="text-xs font-medium text-foreground">{title}</p>

          {showIncludeInactive && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="h-4 w-4 rounded border-muted-foreground/40 accent-[color:var(--navbar)]"
              />
              <span>Include Deactivated</span>
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded border border-input bg-background pl-8 pr-2.5 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklch,var(--navbar)_40%,transparent)] focus-visible:ring-offset-2"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 px-3 text-white hover:opacity-90"
              style={NAV}
              onClick={() => {
                /* filter is live; button matches ERP Search(F3) */
              }}
            >
              Search(F3)
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8">
              Option
            </Button>
          </div>

          <div className="overflow-x-auto rounded border border-border">
            <table
              className={cn(
                "w-full min-w-0 border-collapse text-sm",
                columnClassNames?.length ? "table-fixed" : "min-w-[640px]"
              )}
            >
              {columnClassNames?.length === 2 && (
                <colgroup>
                  <col className="w-[4.5rem]" />
                  <col />
                </colgroup>
              )}
              {columnClassNames?.length === 1 && (
                <colgroup>
                  <col className="min-w-0" />
                </colgroup>
              )}
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <th className="w-10 px-1 py-1.5">
                    <input
                      ref={headerSelectAllRef}
                      type="checkbox"
                      className="h-4 w-4 rounded border-muted-foreground/40 accent-[color:var(--navbar)]"
                      checked={allVisibleSelected}
                      onChange={toggleHeader}
                      aria-label="Select all visible"
                    />
                  </th>
                  <th className="w-10 px-1 py-1.5 text-center">#</th>
                  {!hideTypeColumn && (
                    <th className="min-w-[88px] px-2 py-1.5">
                      Type
                      <span className="ml-0.5 text-[10px] text-muted-foreground">▼</span>
                    </th>
                  )}
                  {columnLabels.map((label, i) => (
                    <th
                      key={label}
                      className={cn("px-2 py-1.5", columnClassNames?.[i] ?? "min-w-[100px]")}
                    >
                      {label}
                      <span className="ml-0.5 text-[10px] text-muted-foreground">▼</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tableColSpan}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No rows match.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, idx) => {
                    const selected = draft.has(r.id);
                    const num = idx + 1;
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          "cursor-pointer border-b border-border/80",
                          idx % 2 === 1 && "bg-muted/25",
                          selected &&
                            "bg-[color-mix(in_oklch,var(--navbar)_14%,white)] dark:bg-[color-mix(in_oklch,var(--navbar)_22%,transparent)]"
                        )}
                        onClick={() => toggleRow(r.id)}
                      >
                        <td
                          className="px-1 py-1"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-muted-foreground/40 accent-[color:var(--navbar)]"
                            checked={selected}
                            onChange={() => toggleRow(r.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select row ${num}`}
                          />
                        </td>
                        <td
                          className={cn(
                            "px-1 py-1 text-center text-xs tabular-nums",
                            selected && "font-medium text-white"
                          )}
                          style={selected ? NAV : undefined}
                        >
                          {num}
                        </td>
                        {!hideTypeColumn && <td className="px-2 py-1">{r.typeLabel}</td>}
                        {r.cells.map((cell, i) => (
                          <td
                            key={i}
                            className={cn("px-2 py-1", columnClassNames?.[i])}
                            title={typeof cell === "string" && cell.length > 0 ? cell : undefined}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-3 py-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 px-4 text-white hover:opacity-90"
              style={NAV}
              onClick={handleApply}
            >
              Apply (F8)
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs hover:underline"
            style={{ color: "var(--navbar)" }}
          >
            <Lightbulb className="h-3.5 w-3.5" />
            Keyboard Help View Details
          </button>
        </div>
      </div>
    </>
  );

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(content, document.body);
}

/** Rows for inline type-to-filter (same cell shape as modal grid, without Type column). */
export type ErpInlineFilterRow = {
  id: string;
  cells: string[];
  isInactive?: boolean;
};

type ErpMultiSelectInlineFilterProps = {
  placeholder: string;
  ariaLabel: string;
  rows: ErpInlineFilterRow[];
  selectedIds: Set<string>;
  onApply: (next: Set<string>) => void;
  showIncludeInactive?: boolean;
  includeInactiveDefault?: boolean;
  /** Optional full grid (modal) for browsing large lists. */
  onOpenGrid?: () => void;
};

const INLINE_MAX_UNFILTERED = 200;

export function ErpMultiSelectInlineFilter({
  placeholder,
  ariaLabel,
  rows,
  selectedIds,
  onApply,
  showIncludeInactive = false,
  includeInactiveDefault = true,
  onOpenGrid,
}: ErpMultiSelectInlineFilterProps) {
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [includeInactive, setIncludeInactive] = useState(includeInactiveDefault);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIncludeInactive(includeInactiveDefault);
  }, [includeInactiveDefault]);

  const filteredAll = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (showIncludeInactive && !includeInactive && r.isInactive) return false;
      if (!q) return true;
      return r.cells.join(" ").toLowerCase().includes(q);
    });
  }, [rows, query, showIncludeInactive, includeInactive]);

  const displayRows = useMemo(() => {
    if (!query.trim() && filteredAll.length > INLINE_MAX_UNFILTERED) {
      return filteredAll.slice(0, INLINE_MAX_UNFILTERED);
    }
    return filteredAll;
  }, [filteredAll, query]);

  const truncated = !query.trim() && filteredAll.length > INLINE_MAX_UNFILTERED;

  useEffect(() => {
    setHighlightIndex((i) => {
      if (displayRows.length === 0) return 0;
      return Math.min(Math.max(0, i), displayRows.length - 1);
    });
  }, [displayRows]);

  useEffect(() => {
    if (!listOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setListOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [listOpen]);

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onApply(next);
    },
    [selectedIds, onApply]
  );

  const onInputKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setListOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setListOpen(true);
        setHighlightIndex((i) => Math.min(i + 1, Math.max(0, displayRows.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setListOpen(true);
        setHighlightIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter" && listOpen && displayRows.length > 0) {
        e.preventDefault();
        const row = displayRows[highlightIndex];
        if (row) toggle(row.id);
      }
    },
    [listOpen, displayRows, highlightIndex, toggle]
  );

  return (
    <div ref={rootRef} className="min-w-0 flex-1 space-y-1">
      <div className="flex min-w-0 gap-1">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setListOpen(true);
            }}
            onFocus={() => setListOpen(true)}
            onKeyDown={onInputKeyDown}
            placeholder={placeholder}
            aria-label={ariaLabel}
            autoComplete="off"
            className="h-8 w-full rounded border border-input bg-background pl-8 pr-2.5 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklch,var(--navbar)_40%,transparent)] focus-visible:ring-offset-2"
          />
          {listOpen && (
            <div
              className="absolute left-0 right-0 top-full z-[70] mt-1 max-h-52 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md"
              role="listbox"
            >
              {displayRows.length === 0 ? (
                <div className="px-3 py-2.5 text-sm text-muted-foreground">No matches.</div>
              ) : (
                <ul className="py-1">
                  {displayRows.map((r, idx) => {
                    const selected = selectedIds.has(r.id);
                    const inactive = r.isInactive === true;
                    const label = r.cells.join(" · ");
                    const active = idx === highlightIndex;
                    return (
                      <li key={r.id} role="option" aria-selected={selected}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => toggle(r.id)}
                          onMouseEnter={() => setHighlightIndex(idx)}
                          className={cn(
                            "flex w-full items-start gap-2 px-2 py-1.5 text-left text-sm",
                            active && "bg-muted/80",
                            inactive && "opacity-80"
                          )}
                        >
                          <input
                            type="checkbox"
                            readOnly
                            tabIndex={-1}
                            checked={selected}
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-muted-foreground/40 accent-[color:var(--navbar)]"
                            aria-hidden
                          />
                          <span className="min-w-0 break-words">{label}</span>
                          {inactive ? (
                            <span className="shrink-0 text-[10px] uppercase text-muted-foreground">Inactive</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {truncated ? (
                <p className="border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
                  Showing {INLINE_MAX_UNFILTERED} of {filteredAll.length}. Type to narrow the list.
                </p>
              ) : null}
            </div>
          )}
        </div>
        {onOpenGrid ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            title="Open full search grid"
            aria-label="Open full search grid"
            onClick={() => onOpenGrid()}
          >
            <List className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      {showIncludeInactive ? (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="h-4 w-4 rounded border-muted-foreground/40 accent-[color:var(--navbar)]"
          />
          <span>Include deactivated</span>
        </label>
      ) : null}
    </div>
  );
}

type ErpMultiSelectTriggerProps = {
  placeholder: string;
  selectedCount: number;
  onOpen: () => void;
  ariaLabel: string;
};

export function ErpMultiSelectTrigger({ placeholder, selectedCount, onOpen, ariaLabel }: ErpMultiSelectTriggerProps) {
  return (
    <div className="relative min-w-[10rem] max-w-[20rem] flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <button
        type="button"
        onClick={onOpen}
        aria-label={ariaLabel}
        className="h-8 w-full rounded border border-input bg-background pl-8 pr-2.5 text-left text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklch,var(--navbar)_40%,transparent)] focus-visible:ring-offset-2"
      >
        <span className={cn("block truncate", selectedCount === 0 && "text-muted-foreground")}>
          {selectedCount > 0 ? `${selectedCount} selected` : placeholder}
        </span>
      </button>
    </div>
  );
}

type ErpTagListProps = {
  ids: string[];
  getLabel: (id: string) => string;
  onRemove: (id: string) => void;
};

export function ErpMultiSelectTags({ ids, getLabel, onRemove }: ErpTagListProps) {
  if (ids.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
      {ids.map((id) => (
        <span
          key={id}
          className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-foreground"
          style={{
            borderColor: "color-mix(in oklch, var(--navbar) 35%, transparent)",
            backgroundColor: "color-mix(in oklch, var(--navbar) 12%, var(--background))",
          }}
        >
          <span className="truncate">{getLabel(id)}</span>
          <button
            type="button"
            className="shrink-0 rounded-full px-0.5 hover:bg-black/10 dark:hover:bg-white/10"
            style={{ color: "var(--navbar)" }}
            aria-label={`Remove ${getLabel(id)}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(id);
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
