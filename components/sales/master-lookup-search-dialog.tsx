"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { addMasterDataRow, updateMasterDataRow } from "@/app/dashboard/settings/master-data/actions";

const labelClass = "mb-0.5 block text-xs font-medium";
const inputClass = "h-8 w-full rounded border border-input bg-background px-2.5 text-sm";

type LookupItem = { id: string; code?: string; name: string };
type MasterLookupTable = "price_types" | "customer_types";

type MasterLookupSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  codeLabel: string;
  nameLabel: string;
  table: MasterLookupTable;
  items: LookupItem[];
  onSelect: (item: LookupItem) => void;
  onItemAdded?: () => void;
};

export function MasterLookupSearchDialog({
  open,
  onOpenChange,
  title,
  codeLabel,
  nameLabel,
  table,
  items,
  onSelect,
  onItemAdded,
}: MasterLookupSearchDialogProps) {
  const [search, setSearch] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingItem, setEditingItem] = useState<LookupItem | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = items.filter(
    (item) =>
      (item.name || "").toLowerCase().includes(search.toLowerCase().trim()) ||
      (item.code || "").toLowerCase().includes(search.toLowerCase().trim())
  );

  useEffect(() => {
    if (!open) {
      setSearch("");
      setShowNewForm(false);
      setEditingItem(null);
      setSelectedId(null);
      setError(null);
    }
  }, [open]);

  function startEdit(item: LookupItem) {
    setEditingItem(item);
    setEditCode(item.code ?? "");
    setEditName(item.name);
    setError(null);
  }

  async function handleEditItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem) return;
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("code", editCode.trim());
    formData.set("name", editName.trim());
    const result = await updateMasterDataRow(table, editingItem.id, formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setEditingItem(null);
    onItemAdded?.();
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("code", newCode.trim());
    formData.set("name", newName.trim());
    const result = await addMasterDataRow(table, formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setNewCode("");
    setNewName("");
    setShowNewForm(false);
    onItemAdded?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} showGearIcon={false} contentClassName="max-w-xl text-sm">
      <div className="space-y-3">
        {editingItem ? (
          <form onSubmit={handleEditItem} className="space-y-3">
            {error && <p className="rounded bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>{codeLabel} *</label>
              <input value={editCode} onChange={(e) => setEditCode(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>{nameLabel} *</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} required className={inputClass} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending} style={{ backgroundColor: "var(--navbar)" }} className="text-white">Save</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingItem(null)}>Cancel</Button>
            </div>
          </form>
        ) : showNewForm ? (
          <form onSubmit={handleAddItem} className="space-y-3">
            {error && <p className="rounded bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>{codeLabel} *</label>
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>{nameLabel} *</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required className={inputClass} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending} style={{ backgroundColor: "var(--navbar)" }} className="text-white">Save</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNewForm(false)}>Cancel</Button>
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
              <Button size="sm" style={{ backgroundColor: "var(--navbar)" }} className="text-white">Search (F3)</Button>
            </div>
            <div className="max-h-64 overflow-auto rounded border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>{codeLabel}</th>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>{nameLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-2 py-4 text-center text-muted-foreground">
                        No records. Click New (F2) to add one.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr
                        key={item.id}
                        className={`cursor-pointer border-b border-border last:border-0 hover:bg-muted/50 ${selectedId === item.id ? "bg-muted/50" : ""}`}
                        onClick={() => setSelectedId(item.id)}
                        onDoubleClick={() => {
                          onSelect(item);
                          onOpenChange(false);
                        }}
                      >
                        <td className="px-2 py-2">{item.code ?? "—"}</td>
                        <td className="px-2 py-2 font-medium">{item.name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" onClick={() => setShowNewForm(true)} style={{ color: "var(--navbar)", borderColor: "var(--navbar)" }}>
                <Plus className="mr-1.5 h-4 w-4" /> New (F2)
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedId}
                onClick={() => {
                  const selectedItem = filtered.find((x) => x.id === selectedId);
                  if (selectedItem) startEdit(selectedItem);
                }}
                style={selectedId ? { color: "var(--navbar)", borderColor: "var(--navbar)" } : undefined}
              >
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
