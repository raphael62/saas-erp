"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateOrganization, type OrgRow } from "@/app/dashboard/settings/organization/actions";

type Props = {
  org: OrgRow | null;
};

export function OrganizationSetup({ org }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!org) return;
    setError(null);
    setPending(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const { error: err } = await updateOrganization(org.id, formData);
    setPending(false);
    if (err) {
      setError(err);
      return;
    }
    router.refresh();
  }

  if (!org) {
    return (
      <div className="mt-6 max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="font-medium text-amber-800 dark:text-amber-200">No organization</p>
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
          Your organization is created when you register. If you just signed up, refresh the page. Otherwise, contact your administrator.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <a href="/dashboard">Refresh dashboard</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 max-w-md space-y-6">
      {org.code && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Company code (for invite emails)</p>
          <p className="mt-1 font-mono text-lg font-semibold tracking-wider">{org.code}</p>
          <p className="mt-1 text-xs text-muted-foreground">Users need this code to log in. It is included in invite emails.</p>
        </div>
      )}
      <form onSubmit={handleUpdate} className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Building2 className="h-5 w-5" />
          <span className="text-sm">{org.slug || org.name}</span>
        </div>
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium">
            Organization name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={org.name}
            className="h-9 w-full rounded border border-input bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-medium text-muted-foreground">
            Phone (optional)
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={org.phone ?? ""}
            placeholder="+1 234 567 8900"
            className="h-9 w-full rounded border border-input bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="subscription_ends_date" className="mb-1 block text-sm font-medium text-muted-foreground">
            Subscription end date (optional)
          </label>
          <input
            id="subscription_ends_date"
            name="subscription_ends_date"
            type="date"
            defaultValue={org.subscription_ends_at ? org.subscription_ends_at.slice(0, 10) : ""}
            className="h-9 w-full rounded border border-input bg-background px-3 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Shown in the top bar as days remaining. Leave empty if there is no fixed end date. Uses end of the chosen day (UTC).
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          disabled={pending}
          className="bg-[var(--navbar)] text-[var(--navbar-foreground)] hover:opacity-90"
        >
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </div>
  );
}
