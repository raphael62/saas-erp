"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InviteUserDialog } from "@/components/settings/invite-user-dialog";
import {
  listUsers,
  updateUserRole,
  type UserRow,
  type RoleOption,
} from "@/app/dashboard/settings/users/actions";

type Props = {
  initialUsers: UserRow[];
  initialRoles: RoleOption[];
};

export function UsersClient({ initialUsers, initialRoles }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [users, setUsers] = useState(initialUsers);
  const [roles] = useState(initialRoles);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

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
          const role = roles.find((r) => r.id === value);
          return {
            ...u,
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
    startTransition(async () => {
      const { users: u } = await listUsers();
      setUsers(u);
    });
  };

  return (
    <div className="mt-6">
      <div className="mb-4 flex justify-end">
        <Button
          size="sm"
          onClick={() => setShowInvite(true)}
          className="gap-2 bg-[var(--navbar)] text-[var(--navbar-foreground)] hover:opacity-90"
        >
          <UserPlus className="h-4 w-4" />
          Invite user
        </Button>
      </div>
      {error && (
        <div className="mb-4 rounded border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="w-10 px-3 py-2 text-left"></th>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Email</th>
              <th className="min-w-[180px] px-3 py-2 text-left font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
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
                  <td className="px-3 py-2.5 font-medium">
                    {u.full_name || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {u.email || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={u.role_id ?? ""}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={isPending}
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <InviteUserDialog open={showInvite} onOpenChange={setShowInvite} onSaved={handleInviteSaved} />
    </div>
  );
}
