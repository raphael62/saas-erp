"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { inviteUser } from "@/app/dashboard/settings/users/actions";
import { Copy, Check } from "lucide-react";

const labelClass = "mb-0.5 block text-xs font-medium";
const inputClass = "h-9 w-full rounded border border-input bg-background px-3 text-sm";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function InviteUserDialog({ open, onOpenChange, onSaved }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteSuccessCode, setInviteSuccessCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setError(null);
      setEmail("");
      setFullName("");
      setInviteSuccessCode(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteSuccessCode(null);
    setPending(true);
    const result = await inviteUser(email.trim(), fullName.trim() || undefined);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
    setInviteSuccessCode(result.code ?? null);
  }

  async function copyCode() {
    if (!inviteSuccessCode) return;
    await navigator.clipboard.writeText(inviteSuccessCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setInviteSuccessCode(null);
        onOpenChange(o);
      }}
      title="Invite user"
      subtitle={inviteSuccessCode ? "Login details were sent by email" : "An invite email with login details will be sent to the user"}
    >
      {inviteSuccessCode ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Invitation sent. The email includes the company code when configured in Supabase. If needed, share this code:
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/30 px-3 py-2">
            <span className="font-mono text-base font-semibold tracking-wider">{inviteSuccessCode}</span>
            <button
              type="button"
              onClick={copyCode}
              className="rounded p-1.5 hover:bg-muted"
              aria-label="Copy code"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                setInviteSuccessCode(null);
                onOpenChange(false);
              }}
              className="bg-[var(--navbar)] text-[var(--navbar-foreground)] hover:opacity-90"
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="invite-email" className={labelClass}>
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="colleague@example.com"
            />
          </div>
          <div>
            <label htmlFor="invite-name" className={labelClass + " text-muted-foreground"}>
              Name (optional)
            </label>
            <input
              id="invite-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              placeholder="Jane Doe"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="bg-[var(--navbar)] text-[var(--navbar-foreground)] hover:opacity-90"
            >
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
