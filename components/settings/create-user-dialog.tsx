"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { MultiSelectSearch, type MultiSelectItem } from "@/components/ui/multi-select-search";
import {
  createProvisionedUser,
  type CreateProvisionedUserInput,
  type ProvisioningPickItem,
  type RoleOption,
} from "@/app/dashboard/settings/users/actions";

const labelClass = "mb-0.5 block text-xs font-medium text-muted-foreground";
const inputClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const sectionTitle = "text-sm font-semibold text-foreground";

function generateTempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function toLocationItems(locations: ProvisioningPickItem[]): MultiSelectItem[] {
  return locations.map((l) => ({
    id: l.id,
    label: l.code ? `${l.code} — ${l.name}` : l.name,
  }));
}

function toPaymentItems(accounts: ProvisioningPickItem[]): MultiSelectItem[] {
  return accounts.map((p) => ({
    id: p.id,
    label: p.code ? `${p.code} — ${p.name}` : p.name,
  }));
}

function toRoleItems(roleList: RoleOption[]): MultiSelectItem[] {
  return roleList.map((r) => ({ id: r.id, label: r.name }));
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  locations: ProvisioningPickItem[];
  paymentAccounts: ProvisioningPickItem[];
  salesReps: ProvisioningPickItem[];
  roles: RoleOption[];
};

export function CreateUserDialog({
  open,
  onOpenChange,
  onSaved,
  locations,
  paymentAccounts,
  salesReps,
  roles,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [userCode, setUserCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [locIds, setLocIds] = useState<string[]>([]);
  const [primaryLocId, setPrimaryLocId] = useState<string>("");
  const [payIds, setPayIds] = useState<string[]>([]);
  const [salesRepId, setSalesRepId] = useState<string>("");
  const [sendResetEmail, setSendResetEmail] = useState(false);

  const locationItems = toLocationItems(locations);
  const paymentItems = toPaymentItems(paymentAccounts);
  const roleItems = toRoleItems(roles);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSuccessMsg(null);
      setUserCode("");
      setFullName("");
      setPhone("");
      setEmail("");
      setPassword("");
      setMakeAdmin(false);
      setSelectedRoleIds([]);
      setLocIds([]);
      setPrimaryLocId("");
      setPayIds([]);
      setSalesRepId("");
      setSendResetEmail(false);
    }
  }, [open]);

  function setLocations(ids: string[]) {
    setLocIds(ids);
    if (primaryLocId && !ids.includes(primaryLocId)) setPrimaryLocId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const input: CreateProvisionedUserInput = {
      userCode,
      fullName,
      phone: phone.trim() || undefined,
      email: email.trim(),
      password,
      roleIds: makeAdmin ? [] : selectedRoleIds,
      makeAdmin,
      locationIds: locIds,
      primaryLocationId: primaryLocId || null,
      paymentAccountIds: payIds,
      salesRepId: salesRepId || null,
      sendPasswordResetEmail: sendResetEmail,
    };
    setPending(true);
    const result = await createProvisionedUser(input);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
    const parts = ["User created."];
    if (result.companyCode) parts.push(`Company code: ${result.companyCode}`);
    if (sendResetEmail) parts.push("A password-reset email was sent.");
    setSuccessMsg(parts.join(" "));
  }

  const primaryOptions = locations.filter((l) => locIds.includes(l.id));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create user"
      subtitle="Create a login and set access for your organization."
      contentClassName="max-w-3xl"
      bodyClassName="max-h-[min(90vh,800px)] overflow-y-auto"
    >
      {successMsg ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{successMsg}</p>
          <p className="text-sm text-muted-foreground">
            Share the email and temporary password with the user if they did not receive a reset email.
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                setSuccessMsg(null);
                onOpenChange(false);
              }}
              className="bg-[var(--navbar)] text-[var(--navbar-foreground)] hover:opacity-90"
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cu-code" className={labelClass}>
                User code
              </label>
              <input
                id="cu-code"
                required
                value={userCode}
                onChange={(e) => setUserCode(e.target.value)}
                className={inputClass}
                placeholder="e.g. SR-0001"
              />
            </div>
            <div>
              <label htmlFor="cu-phone" className={labelClass}>
                Phone
              </label>
              <input
                id="cu-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="+233…"
              />
            </div>
            <div>
              <label htmlFor="cu-name" className={labelClass}>
                Name
              </label>
              <input
                id="cu-name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label htmlFor="cu-email" className={labelClass}>
                Email
              </label>
              <input
                id="cu-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="jane@company.com"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={makeAdmin}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setMakeAdmin(on);
                    if (on) setSelectedRoleIds([]);
                  }}
                />
                Admin
              </label>
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <h3 className={sectionTitle}>Temporary password</h3>
            <p className="text-xs text-muted-foreground">
              The user signs in with this password unless you send a reset email below.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="cu-pw"
                type="text"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} font-mono sm:flex-1`}
                placeholder="At least 8 characters"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                title="Generate password"
                onClick={() => setPassword(generateTempPassword())}
              >
                <KeyRound className="h-4 w-4" />
                Generate
              </Button>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={sendResetEmail} onChange={(e) => setSendResetEmail(e.target.checked)} />
              Send password reset email (user can choose a new password)
            </label>
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            <h3 className={sectionTitle}>Access</h3>

            <div>
              <p className={labelClass}>Locations</p>
              <MultiSelectSearch
                items={locationItems}
                value={locIds}
                onChange={setLocations}
                placeholder="Search locations…"
                aria-label="Locations"
              />
            </div>

            <div className="sm:max-w-md">
              <label htmlFor="cu-primary-loc" className={labelClass}>
                Primary location
              </label>
              <select
                id="cu-primary-loc"
                value={primaryLocId}
                onChange={(e) => setPrimaryLocId(e.target.value)}
                className={inputClass}
              >
                <option value="">None</option>
                {primaryOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code ? `${l.code} — ` : ""}
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className={labelClass}>Roles</p>
              <MultiSelectSearch
                items={roleItems}
                value={selectedRoleIds}
                onChange={setSelectedRoleIds}
                placeholder={makeAdmin ? "Disabled while Admin is checked" : "Search roles…"}
                aria-label="Roles"
                disabled={makeAdmin}
              />
              {!makeAdmin && selectedRoleIds.length > 1 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Permissions combine all selected roles (union of access).
                </p>
              )}
              {makeAdmin && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Clear Admin to assign organization roles below.
                </p>
              )}
            </div>

            <div className="sm:max-w-md">
              <label htmlFor="cu-rep" className={labelClass}>
                Linked sales rep
              </label>
              <select
                id="cu-rep"
                value={salesRepId}
                onChange={(e) => setSalesRepId(e.target.value)}
                className={inputClass}
              >
                <option value="">None (no linked sales rep)</option>
                {salesReps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code ? `${r.code} — ` : ""}
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className={labelClass + " mb-0"}>Payment accounts</span>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="font-medium text-[var(--navbar)] underline"
                    onClick={() => setPayIds(paymentAccounts.map((p) => p.id))}
                  >
                    Assign all ({paymentAccounts.length})
                  </button>
                  <span className="text-muted-foreground">
                    {payIds.length} / {paymentAccounts.length} selected
                  </span>
                </div>
              </div>
              <MultiSelectSearch
                items={paymentItems}
                value={payIds}
                onChange={setPayIds}
                placeholder="Select payment accounts…"
                aria-label="Payment accounts"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="bg-[var(--navbar)] text-[var(--navbar-foreground)] hover:opacity-90"
            >
              {pending ? "Creating…" : "Create user"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
