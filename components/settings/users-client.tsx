"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InviteUserDialog } from "@/components/settings/invite-user-dialog";
import { CreateUserDialog } from "@/components/settings/create-user-dialog";
import { EditUserDialog } from "@/components/settings/edit-user-dialog";
import {
  listUsers,
  updateUserRole,
  type UserRow,
  type RoleOption,
  type ProvisioningPickItem,
} from "@/app/dashboard/settings/users/actions";

type Props = {
  initialUsers: UserRow[];
  initialRoles: RoleOption[];
  locations: ProvisioningPickItem[];
  paymentAccounts: ProvisioningPickItem[];
  salesReps: ProvisioningPickItem[];
};

export function UsersClient({
  initialUsers,
  initialRoles,
  locations,
  paymentAccounts,
  salesReps,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [users, setUsers] = useState(initialUsers);
  const [roles] = useState(initialRoles);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F2") return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) {
        return;
      }
      e.preventDefault();
      setShowCreate(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const refreshUsers = () => {
    startTransition(async () => {
      const { users: u } = await listUsers();
      setUsers(u);
    });
  };

  const handleRoleChange = (userId: string, roleId: string) => {
    const value = roleId === "" ? null : roleId;
    startTransition(async () => {
      setError(null);
      const { error: err } = await updateUserRole(userId, value);
      if (err) {
        setError(err);
        return;
      }
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== userId) return u;
          const role = value ? roles.find((r) => r.id === value) : null;
          return {
            ...u,
            role_ids: value ? [value] : [],
            role_id: value,
            role_name: role?.name ?? null,
          };
        })
      );
      router.refresh();
    });
  };

  const handleInviteSaved = () => {
    router.refresh();
    refreshUsers();
  };

  const handleProvisioningSaved = () => {
    router.refresh();
    refreshUsers();
  };

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-xs text-muted-foreground max-sm:w-full">Press F2 to create a user</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowInvite(true)}
          className="gap-2"
        >
          <UserPlus className="h-4 w-4" />
          Invite user
        </Button>
        <Button
          size="sm"
          onClick={() => setShowCreate(true)}
          className="gap-2 bg-[var(--navbar)] text-[var(--navbar-foreground)] hover:opacity-90"
        >
          <UserPlus className="h-4 w-4" />
          Create user
        </Button>
      </div>
      {error && (
        <div className="mb-4 rounded border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="overflow-x-auto overflow-hidden rounded border border-border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="w-10 px-3 py-2 text-left"></th>
              <th className="px-3 py-2 text-left font-medium">Code</th>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Email</th>
              <th className="px-3 py-2 text-left font-medium">Phone</th>
              <th className="min-w-[180px] px-3 py-2 text-left font-medium">Role</th>
              <th className="w-[88px] px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No users in your organization.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-border transition-colors hover:bg-muted/30"
                >
                  <td className="px-3 py-2.5">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">{u.user_code || "—"}</td>
                  <td className="px-3 py-2.5 font-medium">{u.full_name || "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{u.email || "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{u.phone || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="mb-1 line-clamp-2 text-xs text-muted-foreground" title={u.role_name ?? undefined}>
                      {u.role_name ?? "—"}
                    </div>
                    <select
                      value={u.role_id ?? ""}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={isPending}
                      title="Replaces all assigned roles with this one. Use Edit to assign multiple roles."
                      className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
                    >
                      <option value="">No role</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setEditUserId(u.id)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--navbar)] hover:bg-muted"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <InviteUserDialog open={showInvite} onOpenChange={setShowInvite} onSaved={handleInviteSaved} />
      <CreateUserDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSaved={handleProvisioningSaved}
        locations={locations}
        paymentAccounts={paymentAccounts}
        salesReps={salesReps}
        roles={roles}
      />
      <EditUserDialog
        open={editUserId !== null}
        onOpenChange={(open) => !open && setEditUserId(null)}
        userId={editUserId}
        onSaved={handleProvisioningSaved}
        locations={locations}
        paymentAccounts={paymentAccounts}
        salesReps={salesReps}
        roles={roles}
      />
    </div>
  );
}
