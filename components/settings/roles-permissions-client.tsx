"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleFormDialog } from "@/components/settings/role-form-dialog";
import { PermissionMatrix } from "@/components/settings/permission-matrix";
import {
  listRoles,
  getRolePermissions,
  saveRolePermissions,
  type RoleRow,
  type PermissionRow,
} from "@/app/dashboard/settings/roles-permissions/actions";

type Props = {
  initialRoles: RoleRow[];
};

export function RolesPermissionsClient({ initialRoles }: Props) {
  const router = useRouter();
  const [roles, setRoles] = useState<RoleRow[]>(initialRoles);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [showNewRole, setShowNewRole] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refreshRoles = useCallback(async () => {
    const { roles: r, error } = await listRoles();
    if (!error) setRoles(r);
  }, []);

  const selectRole = useCallback(async (id: string) => {
    setSelectedId(id);
    setLoadError(null);
    const { permissions: p, error } = await getRolePermissions(id);
    if (error) setLoadError(error);
    else setPermissions(p);
  }, []);

  const handleNewRoleSaved = useCallback(
    async (roleId: string) => {
      await refreshRoles();
      setSelectedId(roleId);
      const { permissions: p } = await getRolePermissions(roleId);
      setPermissions(p);
      router.refresh();
    },
    [refreshRoles, router]
  );

  const handleSavePermissions = useCallback(
    async (perms: Omit<PermissionRow, "id">[]) => {
      if (!selectedId) return;
      setSaving(true);
      setSaveError(null);
      const { error } = await saveRolePermissions(selectedId, perms);
      setSaving(false);
      if (error) setSaveError(error);
      else {
        setPermissions(perms as PermissionRow[]);
        router.refresh();
      }
    },
    [selectedId, router]
  );

  const handleMatrixChange = useCallback((p: Omit<PermissionRow, "id">[]) => {
    setPermissions(p.map((row) => ({ ...row, id: undefined })) as PermissionRow[]);
  }, []);

  const selectedRole = roles.find((r) => r.id === selectedId);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Roles</h2>
          <Button
            size="sm"
            onClick={() => setShowNewRole(true)}
            className="bg-[var(--navbar)] text-[var(--navbar-foreground)] hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New Role
          </Button>
        </div>
        <div className="rounded border border-border">
          {roles.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No roles yet. Create one to get started.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {roles.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => selectRole(r.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 ${
                      selectedId === r.id
                        ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                        : ""
                    }`}
                  >
                    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.user_count} user{r.user_count !== 1 ? "s" : ""}
                        {!r.is_active && " · Inactive"}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="min-w-0">
        {!selectedId ? (
          <div className="rounded border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            Select a role to configure permissions.
          </div>
        ) : loadError ? (
          <div className="rounded border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : (
          <div>
            <h2 className="mb-2 text-sm font-medium">
              Permissions{selectedRole ? ` — ${selectedRole.name}` : ""}
            </h2>
            {saveError && (
              <div className="mb-3 rounded border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                {saveError}
              </div>
            )}
            <PermissionMatrix
              permissions={permissions}
              onChange={handleMatrixChange}
              onSave={handleSavePermissions}
              saving={saving}
            />
          </div>
        )}
      </div>

      <RoleFormDialog
        open={showNewRole}
        onOpenChange={setShowNewRole}
        onSaved={handleNewRoleSaved}
      />
    </div>
  );
}
