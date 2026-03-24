import Link from "next/link";
import { UsersClient } from "@/components/settings/users-client";
import { listUsers, listRolesForSelect } from "@/app/dashboard/settings/users/actions";
import { requireOrgId } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

export default async function UsersPage() {
  const { orgId } = await requireOrgId();
  if (!orgId) {
    return (
      <div>
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/dashboard/settings" className="hover:text-foreground">Preferences</Link>
          <span>/</span>
          <span className="text-foreground">Users</span>
        </div>
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage users in your organization and assign roles.</p>
        <div className="mt-4">
          <NoOrgPrompt />
        </div>
      </div>
    );
  }

  const [usersResult, rolesResult] = await Promise.all([listUsers(), listRolesForSelect()]);
  const users = usersResult.users;
  const roles = rolesResult.roles;
  const loadError = usersResult.error ?? rolesResult.error;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/settings" className="hover:text-foreground">Preferences</Link>
        <span>/</span>
        <span className="text-foreground">Users</span>
      </div>
      <h1 className="text-xl font-semibold">Users</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage users in your organization and assign roles.</p>
      {loadError && (
        <div className="mt-4 space-y-3 rounded border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <p>{loadError}</p>
        </div>
      )}
      <UsersClient initialUsers={users} initialRoles={roles} />
    </div>
  );
}
