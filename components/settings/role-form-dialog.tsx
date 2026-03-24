"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { createRole } from "@/app/dashboard/settings/roles-permissions/actions";

const labelClass = "mb-0.5 block text-xs font-medium";
const inputClass = "h-8 w-full rounded border border-input bg-background px-2.5 text-sm";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (roleId: string) => void;
};

export function RoleFormDialog({ open, onOpenChange, onSaved }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) {
      setError(null);
      setName("");
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("name", name.trim());
    const result = await createRole(formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    if (result?.id) {
      onSaved(result.id);
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Role"
      subtitle="Create a custom role for your organization"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="role-name" className={labelClass}>
            Role name
          </label>
          <input
            id="role-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="e.g. Sales Manager"
            required
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? "Creating…" : "Create"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
