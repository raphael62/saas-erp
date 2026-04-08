"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * Legacy ERP–style search dialog: search row, labeled list with delete per row,
 * New entry… + New (F2), Edit, solid Select, Close.
 */
export function ProductStyleSearchBlobDialog({
  title,
  open,
  onOpenChange,
  items,
  onItemsChange,
  onSelect,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: string[];
  onItemsChange: (items: string[]) => void;
  onSelect: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [editValue, setEditValue] = useState("");
  const [quickNew, setQuickNew] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedId(null);
      setShowNewForm(false);
      setShowEditForm(false);
      setNewValue("");
      setEditValue("");
      setQuickNew("");
    }
  }, [open]);

  const deleteItemAtIndex = useCallback(
    (idx: number) => {
      onItemsChange(items.filter((_, i) => i !== idx));
      setSelectedId(null);
    },
    [items, onItemsChange]
  );

  const handleNewF2 = useCallback(() => {
    const v = quickNew.trim();
    if (v) {
      if (!items.some((x) => x.toLowerCase() === v.toLowerCase())) {
        onItemsChange([...items, v]);
      }
      setQuickNew("");
      return;
    }
    setShowNewForm(true);
  }, [quickNew, items, onItemsChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (showNewForm || showEditForm) return;
      if (e.key === "F3") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "F2") {
        e.preventDefault();
        handleNewF2();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleNewF2, showNewForm, showEditForm]);

  const rowItems = useMemo(
    () => items.map((name, idx) => ({ id: String(idx), name })),
    [items]
  );

  const selectedItem = rowItems.find((x) => x.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rowItems;
    return rowItems.filter((v) => v.name.toLowerCase().includes(q));
  }, [rowItems, search]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      showGearIcon={false}
      contentClassName="max-w-lg text-sm"
      bodyClassName="max-h-[85vh] overflow-y-auto p-4"
    >
      <div className="space-y-3">
        {showNewForm ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const value = newValue.trim();
              if (!value) return;
              const exists = items.some((x) => x.toLowerCase() === value.toLowerCase());
              if (!exists) {
                onItemsChange([...items, value]);
              }
              onSelect(value);
              setShowNewForm(false);
              setNewValue("");
            }}
          >
            <div>
              <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
                Name *
              </label>
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNewForm(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-white" style={{ backgroundColor: "var(--navbar)" }}>
                Save
              </Button>
            </div>
          </form>
        ) : showEditForm ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedItem) return;
              const value = editValue.trim();
              if (!value) return;
              const next = [...items];
              const selectedIndex = Number(selectedItem.id);
              if (selectedIndex < 0 || selectedIndex >= next.length) return;
              next[selectedIndex] = value;
              onItemsChange(Array.from(new Set(next)));
              onSelect(value);
              setShowEditForm(false);
            }}
          >
            <div>
              <label className="mb-0.5 block text-xs font-medium" style={{ color: "var(--navbar)" }}>
                Name *
              </label>
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowEditForm(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-white" style={{ backgroundColor: "var(--navbar)" }}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-stretch gap-2">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search (F3)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 min-w-0 flex-1 rounded border border-input bg-background px-2.5 text-sm"
              />
              <Button
                type="button"
                size="sm"
                className="shrink-0 gap-1.5 whitespace-nowrap text-white"
                style={{ backgroundColor: "var(--navbar)" }}
                onClick={() => searchInputRef.current?.focus()}
              >
                <Search className="h-4 w-4" />
                Search (F3)
              </Button>
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--navbar)" }}>
              {title}
            </p>
            <div className="max-h-64 overflow-y-auto rounded border border-border bg-background">
              {filtered.length === 0 ? (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No records. Type in New entry… and click New (F2), or leave it blank and click New (F2) for the full form.
                </div>
              ) : (
                filtered.map((item) => {
                  const idx = Number(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-stretch border-b border-border last:border-b-0 ${
                        selectedId === item.id ? "bg-muted/50" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 cursor-pointer px-2 py-2 text-left text-sm font-medium hover:bg-muted/40"
                        onClick={() => setSelectedId(item.id)}
                        onDoubleClick={() => {
                          onSelect(item.name);
                          onOpenChange(false);
                        }}
                      >
                        {item.name}
                      </button>
                      <button
                        type="button"
                        className="flex shrink-0 items-center px-2 hover:bg-muted/60"
                        style={{ color: "var(--navbar)" }}
                        aria-label={`Delete ${item.name}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          deleteItemAtIndex(idx);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <input
              type="text"
              placeholder="New entry..."
              value={quickNew}
              onChange={(e) => setQuickNew(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = quickNew.trim();
                  if (!v) return;
                  if (!items.some((x) => x.toLowerCase() === v.toLowerCase())) {
                    onItemsChange([...items, v]);
                  }
                  setQuickNew("");
                }
              }}
              className="h-8 w-full rounded border border-input bg-background px-2.5 text-sm"
            />
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                className="border-foreground/25 bg-background text-foreground"
                type="button"
                onClick={() => handleNewF2()}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New (F2)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-foreground/25 bg-background text-foreground"
                disabled={!selectedItem}
                onClick={() => {
                  if (!selectedItem) return;
                  setEditValue(selectedItem.name);
                  setShowEditForm(true);
                }}
              >
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
              <Button
                size="sm"
                disabled={!selectedItem}
                className="text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--navbar)" }}
                onClick={() => {
                  if (!selectedItem) return;
                  onSelect(selectedItem.name);
                  onOpenChange(false);
                }}
              >
                Select
              </Button>
              <Button variant="outline" size="sm" className="border-foreground/25 bg-background" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
