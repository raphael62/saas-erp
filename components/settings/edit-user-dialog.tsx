"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { MultiSelectSearch, type MultiSelectItem } from "@/components/ui/multi-select-search";
import {
  adminSetUserPassword,
  getUserProvisioningDetail,
  updateProvisionedUser,
  type ProvisioningPickItem,
  type RoleOption,
  type UserProvisioningDetail,
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
  userId: string | null;
  onSaved: () => void;
  locations: ProvisioningPickItem[];
  paymentAccounts: ProvisioningPickItem[];
  salesReps: ProvisioningPickItem[];
  roles: RoleOption[];
};

export function EditUserDialog({
  open,
  onOpenChange,
  userId,
  onSaved,
  locations,
  paymentAccounts,
  salesReps,
  roles,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserProvisioningDetail | null>(null);

  const [userCode, setUserCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [locIds, setLocIds] = useState<string[]>([]);
  const [primaryLocId, setPrimaryLocId] = useState<string>("");
  const [payIds, setPayIds] = useState<string[]>([]);
  const [salesRepId, setSalesRepId] = useState<string>("");

  const [tempPassword, setTempPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const locationItems = toLocationItems(locations);
  const paymentItems = toPaymentItems(paymentAccounts);
  const roleItems = toRoleItems(roles);

  useEffect(() => {
    if (!open) {
      setTempPassword("");
      setResetMessage(null);
      setResetError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !userId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { detail: d, error: err } = await getUserProvisioningDetail(userId);
      if (cancelled) return;
      setLoading(false);
      if (err || !d) {
        setError(err ?? "Failed to load user");
        setDetail(null);
        return;
      }
      setDetail(d);
      setUserCode(d.user_code ?? "");
      setFullName(d.full_name ?? "");
      setPhone(d.phone ?? "");
      const adminLegacy = (d.role ?? "").toLowerCase() === "admin";
      setMakeAdmin(adminLegacy);
      setSelectedRoleIds(!adminLegacy && d.role_ids.length > 0 ? [...d.role_ids] : []);
      setLocIds([...d.location_ids]);
      setPrimaryLocId(d.default_location_id ?? "");
      setPayIds([...d.payment_account_ids]);
      setSalesRepId(d.linked_sales_rep_id ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  function setLocations(ids: string[]) {
    setLocIds(ids);
    if (primaryLocId && !ids.includes(primaryLocId)) setPrimaryLocId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setError(null);
    setSaving(true);

    const { error: err } = await updateProvisionedUser({
      userId,
      userCode,
      fullName,
      phone: phone.trim() || undefined,
      roleIds: makeAdmin ? [] : selectedRoleIds,
      makeAdmin,
      locationIds: locIds,
      primaryLocationId: primaryLocId || null,
      paymentAccountIds: payIds,
      salesRepId: salesRepId || null,
    });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onSaved();
    onOpenChange(false);
  }

  async function handleResetPassword() {
    if (!userId) return;
    setResetError(null);
    setResetMessage(null);
    if (tempPassword.length < 8) {
      setResetError("Enter a password of at least 8 characters or generate one.");
      return;
    }
    setResetBusy(true);
    const { error: err } = await adminSetUserPassword(userId, tempPassword);
    setResetBusy(false);
    if (err) {
      setResetError(err);
      return;
    }
    setResetMessage("Password updated.");
    setTempPassword("");
    onSaved();
  }

  const primaryOptions = locations.filter((l) => locIds.includes(l.id));
  const idShort = userId ? `${userId.slice(0, 8)}…` : "";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit user"
      subtitle={detail?.email ? `${detail.email} · ID ${idShort}` : idShort ? `ID ${idShort}` : undefined}
      contentClassName="max-w-3xl"
      bodyClassName="max-h-[min(90vh,800px)] overflow-y-auto"
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error && !detail ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
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
              <label htmlFor="eu-code" className={labelClass}>
                User code
              </label>
              <input
                id="eu-code"
                required
                placeholder="e.g. SR-0001"
                value={userCode}
                onChange={(e) => setUserCode(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="eu-phone" className={labelClass}>
                Phone
              </label>
              <input
                id="eu-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="eu-name" className={labelClass}>
                Name
              </label>
              <input
                id="eu-name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="eu-email" className={labelClass}>
                Email
              </label>
              <input
                id="eu-email"
                type="email"
                readOnly
                value={detail?.email ?? ""}
                className={cnReadonly(inputClass)}
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
              <label htmlFor="eu-primary" className={labelClass}>
                Primary location
              </label>
              <select
                id="eu-primary"
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
              <label htmlFor="eu-rep" className={labelClass}>
                Linked sales rep
              </label>
              <select
                id="eu-rep"
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

          <div className="space-y-3 border-t border-border pt-4">
            <h3 className={sectionTitle}>Reset password</h3>
            <p className="text-xs text-muted-foreground">
              Set a new temporary password for this user. This applies immediately and is separate from Save.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="password"
                autoComplete="new-password"
                placeholder="New temporary password"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                className={inputClass + " sm:flex-1"}
                minLength={8}
              />
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setResetError(null);
                    setResetMessage(null);
                    setTempPassword(generateTempPassword());
                  }}
                >
                  <KeyRound className="h-4 w-4" />
                  Generate
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={resetBusy}
                  className="gap-1.5 bg-rose-600 text-white hover:bg-rose-600/90"
                  onClick={handleResetPassword}
                >
                  <KeyRound className="h-4 w-4" />
                  {resetBusy ? "…" : "Reset"}
                </Button>
              </div>
            </div>
            {resetError && <p className="text-sm text-destructive">{resetError}</p>}
            {resetMessage && <p className="text-sm text-emerald-700 dark:text-emerald-400">{resetMessage}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[var(--navbar)] text-[var(--navbar-foreground)] hover:opacity-90"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function cnReadonly(base: string) {
  return `${base} cursor-not-allowed bg-muted/40 text-muted-foreground`;
}
