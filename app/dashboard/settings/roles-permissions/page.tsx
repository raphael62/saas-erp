import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasFullAccess } from "@/lib/roles";
import { RolesPermissionsClient } from "@/components/settings/roles-permissions-client";
import { listRoles } from "./actions";
import { Button } from "@/components/ui/button";

export default async function RolesPermissionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id?: string } | null)?.organization_id;
  if (!orgId) {
    return (
      <div>
        <p className="text-muted-foreground mb-4">No organization assigned. Set up your organization first.</p>
        <Button asChild className="bg-[var(--navbar)] text-[var(--navbar-foreground)] hover:opacity-90">
          <Link href="/dashboard/settings/organization">Set up organization</Link>
        </Button>
      </div>
    );
  }

  const role = (profile as { role?: string | null } | null)?.role ?? null;
  const { data: org } = await supabase
    .from("organizations")
    .select("created_by")
    .eq("id", orgId)
    .single();
  const isOwner = (org as { created_by?: string | null } | null)?.created_by === user.id;
  const canManage = hasFullAccess(role) || isOwner;

  if (!canManage) {
    return (
      <div>
        <p className="text-muted-foreground">You do not have permission to manage roles and permissions.</p>
      </div>
    );
  }

  const { roles, error } = await listRoles();

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Roles & Permissions</h1>
      {error ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          <p>{error}</p>
        </div>
      ) : (
        <RolesPermissionsClient initialRoles={roles} />
      )}
    </div>
  );
}
