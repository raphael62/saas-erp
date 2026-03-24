import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrganizationSetup } from "@/components/settings/organization-setup";
import { getOrganization } from "./actions";

export default async function OrganizationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { org, error } = await getOrganization();

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/settings" className="hover:text-foreground">
          Preferences
        </Link>
        <span>/</span>
        <span className="text-foreground">Organization</span>
      </div>
      <h1 className="text-xl font-semibold">Organization</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {org ? "Manage your organization details. Use the company code when inviting users so they can log in." : "Your organization is created at registration."}
      </p>
      {error && (
        <div className="mt-4 rounded border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <OrganizationSetup org={org} />
    </div>
  );
}
