"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { addMasterDataRow, updateMasterDataRow } from "@/app/dashboard/settings/master-data/actions";

const labelClass = "mb-0.5 block text-xs font-medium";
const inputClass = "h-8 w-full rounded border border-input bg-background px-2.5 text-sm";

type Unit = { id: string; code?: string; name: string };

type UnitSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: Unit[];
  onSelect: (unit: Unit) => void;
  onUnitAdded?: () => void;
};

export function UnitSearchDialog({
  open,
  onOpenChange,
  units,
  onSelect,
  onUnitAdded,
}: UnitSearchDialogProps) {
  const [search, setSearch] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = units.filter(
    (u) =>
      (u.name || "").toLowerCase().includes(search.toLowerCase().trim()) ||
      ((u as Unit & { code?: string }).code || "").toLowerCase().includes(search.toLowerCase().trim())
  );

  useEffect(() => {
    if (!open) {
      setSearch("");
      setShowNewForm(false);
      setEditingUnit(null);
      setSelectedId(null);
      setError(null);
    }
  }, [open]);

  function startEdit(u: Unit) {
    setEditingUnit(u);
    setEditCode((u as Unit & { code?: string }).code ?? "");
    setEditName(u.name);
    setError(null);
  }

  async function handleEditUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUnit) return;
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("code", editCode.trim());
    formData.set("name", editName.trim());
    const result = await updateMasterDataRow("units_of_measure", editingUnit.id, formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setEditingUnit(null);
    onUnitAdded?.();
  }

  async function handleAddUnit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("code", newCode.trim());
    formData.set("name", newName.trim());
    const result = await addMasterDataRow("units_of_measure", formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setNewCode("");
    setNewName("");
    setShowNewForm(false);
    onUnitAdded?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Unit of Measure Search" showGearIcon={false} contentClassName="max-w-xl text-sm">
      <div className="space-y-3">
        {editingUnit ? (
          <form onSubmit={handleEditUnit} className="space-y-3">
            {error && <p className="rounded bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Code *</label>
              <input value={editCode} onChange={(e) => setEditCode(e.target.value)} required placeholder="e.g. CTN" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Name *</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} required placeholder="Unit name" className={inputClass} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending} style={{ backgroundColor: "var(--navbar)" }} className="text-white">Save</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingUnit(null)}>Cancel</Button>
            </div>
          </form>
        ) : showNewForm ? (
          <form onSubmit={handleAddUnit} className="space-y-3">
            {error && <p className="rounded bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Code *</label>
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)} required placeholder="e.g. CTN" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>Name *</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="Unit name" className={inputClass} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending} style={{ backgroundColor: "var(--navbar)" }} className="text-white">Save</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNewForm(false)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input type="text" placeholder="Search (F3)" value={search} onChange={(e) => setSearch(e.target.value)} className={inputClass} />
              <Button size="sm" style={{ backgroundColor: "var(--navbar)" }} className="text-white">Search (F3)</Button>
            </div>
            <div className="max-h-64 overflow-auto rounded border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>Unit Code</th>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>Unit Name</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={2} className="px-2 py-4 text-center text-muted-foreground">No units. Click New (F2) to add one.</td></tr>
                  ) : (
                    filtered.map((u) => (
                      <tr
                        key={u.id}
                        className={`cursor-pointer border-b border-border last:border-0 hover:bg-muted/50 ${selectedId === u.id ? "bg-muted/50" : ""}`}
                        onClick={() => setSelectedId(u.id)}
                        onDoubleClick={() => { onSelect(u); onOpenChange(false); }}
                      >
                        <td className="px-2 py-2">{(u as Unit & { code?: string }).code ?? "—"}</td>
                        <td className="px-2 py-2 font-medium">{u.name}</td>
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
                onClick={() => { const u = filtered.find((x) => x.id === selectedId); if (u) startEdit(u); }}
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
