"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { addMasterDataRow, updateMasterDataRow } from "@/app/dashboard/settings/master-data/actions";

const labelClass = "mb-0.5 block text-xs font-medium";
const inputClass = "h-8 w-full rounded border border-input bg-background px-2.5 text-sm";

type Category = { id: string; code?: string; name: string };

type CategorySearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onSelect: (category: Category) => void;
  onCategoryAdded?: () => void;
};

export function CategorySearchDialog({
  open,
  onOpenChange,
  categories,
  onSelect,
  onCategoryAdded,
}: CategorySearchDialogProps) {
  const [search, setSearch] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = categories.filter(
    (c) =>
      (c.name || "").toLowerCase().includes(search.toLowerCase().trim()) ||
      ((c as Category & { code?: string }).code || "").toLowerCase().includes(search.toLowerCase().trim())
  );

  useEffect(() => {
    if (!open) {
      setSearch("");
      setShowNewForm(false);
      setEditingCategory(null);
      setSelectedId(null);
      setError(null);
    }
  }, [open]);

  function startEdit(c: Category) {
    setEditingCategory(c);
    setEditCode((c as Category & { code?: string }).code ?? "");
    setEditName(c.name);
    setError(null);
  }

  async function handleEditCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCategory) return;
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("code", editCode.trim());
    formData.set("name", editName.trim());
    const result = await updateMasterDataRow("brand_categories", editingCategory.id, formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setEditingCategory(null);
    onCategoryAdded?.();
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("code", newCode.trim());
    formData.set("name", newName.trim());
    const result = await addMasterDataRow("brand_categories", formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setNewCode("");
    setNewName("");
    setShowNewForm(false);
    onCategoryAdded?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="BrandCategory Search" showGearIcon={false} contentClassName="max-w-xl text-sm">
      <div className="space-y-3">
        {editingCategory ? (
          <form onSubmit={handleEditCategory} className="space-y-3">
            {error && (
              <p className="rounded bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>
            )}
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Code *</label>
              <input
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                required
                placeholder="e.g. 00001"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Name *</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                placeholder="Category name"
                className={inputClass}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending} style={{ backgroundColor: "var(--navbar)" }} className="text-white">
                Save
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingCategory(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : showNewForm ? (
          <form onSubmit={handleAddCategory} className="space-y-3">
            {error && (
              <p className="rounded bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>
            )}
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Code *</label>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                required
                placeholder="e.g. 00001"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Name *</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                placeholder="Category name"
                className={inputClass}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending} style={{ backgroundColor: "var(--navbar)" }} className="text-white">
                Save
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNewForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search (F3)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={inputClass}
              />
              <Button size="sm" style={{ backgroundColor: "var(--navbar)" }} className="text-white">
                Search (F3)
              </Button>
            </div>

            <div className="max-h-64 overflow-auto rounded border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>BrandCategory Code</th>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>BrandCategory Name</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-2 py-4 text-center text-muted-foreground">
                        No categories. Click New (F2) to add one.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => (
                      <tr
                        key={c.id}
                        className={`cursor-pointer border-b border-border last:border-0 hover:bg-muted/50 ${selectedId === c.id ? "bg-muted/50" : ""}`}
                        onClick={() => setSelectedId(c.id)}
                        onDoubleClick={() => {
                          onSelect(c);
                          onOpenChange(false);
                        }}
                      >
                        <td className="px-2 py-2">{(c as Category & { code?: string }).code ?? "—"}</td>
                        <td className="px-2 py-2 font-medium">{c.name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewForm(true)}
                style={{ color: "var(--navbar)", borderColor: "var(--navbar)" }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New (F2)
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedId}
                onClick={() => {
                  const c = filtered.find((x) => x.id === selectedId);
                  if (c) startEdit(c);
                }}
                style={selectedId ? { color: "var(--navbar)", borderColor: "var(--navbar)" } : undefined}
              >
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
