"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const labelClass = "mb-0.5 block text-xs font-medium";
const inputClass = "h-8 w-full rounded border border-input bg-background px-2.5 text-sm";

export type RepTypeItem = { id: string; code: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repTypes: RepTypeItem[];
  onRepTypesChange: (types: RepTypeItem[]) => void;
  onSelect: (name: string) => void;
};

export function SalesRepTypeSearchDialog({
  open,
  onOpenChange,
  repTypes,
  onRepTypesChange,
  onSelect,
}: Props) {
  const [search, setSearch] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingItem, setEditingItem] = useState<RepTypeItem | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = repTypes.filter(
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
    }
  }, [open]);

  function startEdit(item: RepTypeItem) {
    setEditingItem(item);
    setEditCode(item.code ?? "");
    setEditName(item.name);
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem) return;
    const code = editCode.trim();
    const name = editName.trim();
    if (!name) return;
    onRepTypesChange(
      repTypes.map((t) =>
        t.id === editingItem.id ? { ...t, code, name } : t
      )
    );
    setEditingItem(null);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const code = newCode.trim();
    const name = newName.trim();
    if (!name) return;
    const exists = repTypes.some((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!exists) {
      const id = `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
      onRepTypesChange([...repTypes, { id, code, name }]);
    }
    setNewCode("");
    setNewName("");
    setShowNewForm(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Sales Rep Type Search"
      showGearIcon={false}
      contentClassName="max-w-xl text-sm"
    >
      <div className="space-y-3">
        {editingItem ? (
          <form onSubmit={handleEdit} className="space-y-3">
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>
                Code *
              </label>
              <input
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                required
                placeholder="e.g. SLS"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>
                Name *
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                placeholder="Rep type name"
                className={inputClass}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                style={{ backgroundColor: "var(--navbar)" }}
                className="text-white"
              >
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingItem(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : showNewForm ? (
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>
                Code *
              </label>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                required
                placeholder="e.g. SLS"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--navbar)" }}>
                Name *
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                placeholder="Rep type name"
                className={inputClass}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                style={{ backgroundColor: "var(--navbar)" }}
                className="text-white"
              >
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowNewForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={inputClass}
              />
              <Button
                size="sm"
                style={{ backgroundColor: "var(--navbar)" }}
                className="text-white"
              >
                Search
              </Button>
            </div>
            <div className="max-h-64 overflow-auto rounded border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>
                      Code
                    </th>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--navbar)" }}>
                      Name
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-2 py-4 text-center text-muted-foreground">
                        No sales rep types. Click New to add one.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr
                        key={item.id}
                        className={`cursor-pointer border-b border-border last:border-0 hover:bg-muted/50 ${
                          selectedId === item.id ? "bg-muted/50" : ""
                        }`}
                        onClick={() => setSelectedId(item.id)}
                        onDoubleClick={() => {
                          onSelect(item.name);
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewForm(true)}
                style={{ color: "var(--navbar)", borderColor: "var(--navbar)" }}
              >
                <Plus className="mr-1.5 h-4 w-4" /> New
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedId}
                onClick={() => {
                  const item = filtered.find((x) => x.id === selectedId);
                  if (item) startEdit(item);
                }}
                style={selectedId ? { color: "var(--navbar)", borderColor: "var(--navbar)" } : undefined}
              >
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedId}
                onClick={() => {
                  const item = filtered.find((x) => x.id === selectedId);
                  if (item) {
                    onSelect(item.name);
                    onOpenChange(false);
                  }
                }}
              >
                Select
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
