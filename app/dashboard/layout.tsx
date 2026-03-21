import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TopNavbar from "@/components/dashboard/top-navbar";
import Sidebar from "@/components/dashboard/sidebar";
import { getNavItemsForRole } from "@/lib/nav-utils";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Backfill profile for existing users who signed up before the trigger existed
  let { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    await supabase.from("profiles").insert({
      id: user.id,
      email: user.email ?? undefined,
      full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? "",
    });
    const { data: newProfile } = await supabase
      .from("profiles")
      .select("id, full_name, organization_id, role")
      .eq("id", user.id)
      .single();
    profile = newProfile;
  }

  // Ensure user has an organization (for products, etc.)
  const profileWithOrg = profile as { organization_id?: string | null } | null;
  if (profileWithOrg && !profileWithOrg.organization_id) {
    const orgName = (user.user_metadata?.organization_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "My Organization").toString();
    const slug = orgName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "org";
    const { data: newOrg } = await supabase
      .from("organizations")
      .insert({ name: orgName, slug })
      .select("id")
      .single();
    if (newOrg?.id) {
      await supabase.from("profiles").update({ organization_id: newOrg.id }).eq("id", user.id);
    }
  }

  const userName =
    (profile as { full_name?: string } | null)?.full_name ??
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    undefined;

  const userRole = (profile as { role?: string | null } | null)?.role ?? null;
  const navItems = getNavItemsForRole(userRole);

  return (
    <div className="min-h-screen flex flex-col">
      <TopNavbar userEmail={user.email} userName={userName} userRole={userRole} navItems={navItems} />
      <div className="flex flex-1">
        <Sidebar navItems={navItems} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
