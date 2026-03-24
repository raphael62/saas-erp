import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TopNavbar from "@/components/dashboard/top-navbar";
import Sidebar from "@/components/dashboard/sidebar";
import { getNavForUser } from "@/lib/permissions";
import { mainNavItems } from "@/lib/nav-items";

const LAYOUT_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Supabase timeout")), ms)
    ),
  ]);
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let content: React.ReactNode;
  try {
    content = await withTimeout(
      (async () => {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          redirect("/login");
        }

        let { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, organization_id, role, role_id")
          .eq("id", user.id)
          .single();

        if (profileError && profileError.message?.includes("role_id")) {
          const { data: fallback } = await supabase
            .from("profiles")
            .select("id, full_name, organization_id, role")
            .eq("id", user.id)
            .single();
          profile = fallback ? { ...fallback, role_id: null } : null;
        }

        if (!profile) {
          await supabase.from("profiles").insert({
            id: user.id,
            email: user.email ?? undefined,
            full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? "",
          });
          const { data: newProfile, error: newProfileError } = await supabase
            .from("profiles")
            .select("id, full_name, organization_id, role, role_id")
            .eq("id", user.id)
            .single();
          if (newProfile) {
            profile = newProfile;
          } else if (newProfileError?.message?.includes("role_id")) {
            const { data: fb } = await supabase
              .from("profiles")
              .select("id, full_name, organization_id, role")
              .eq("id", user.id)
              .single();
            profile = fb ? { ...fb, role_id: null } : null;
          } else {
            profile = newProfile ?? null;
          }
        }

        let profileWithOrg = profile as { organization_id?: string | null } | null;
        const skipNavPermissions = process.env.NEXT_PUBLIC_DISABLE_NAV_PERMISSIONS === "1";

        if (!profileWithOrg?.organization_id) {
          const { getOrgIdForUser, ensureDevOrg } = await import("@/lib/org-context");
          const { isDevBypassEnabled } = await import("@/lib/platform-admin");
          let resolvedOrgId = await getOrgIdForUser(user.id, user.email ?? undefined);
          if (!resolvedOrgId && isDevBypassEnabled()) {
            resolvedOrgId = await ensureDevOrg(user.id);
          }
          if (resolvedOrgId && profile) {
            profileWithOrg = { ...profile, organization_id: resolvedOrgId } as typeof profileWithOrg;
          }
        }

        const userName =
          (profile as { full_name?: string } | null)?.full_name ??
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          undefined;

        const userRole = (profile as { role?: string | null } | null)?.role ?? null;
        let navItems: typeof mainNavItems;
        if (skipNavPermissions) {
          navItems = mainNavItems;
        } else {
          const profileForNav = profileWithOrg as { role?: string | null; role_id?: string | null; organization_id?: string | null } | null;
          try {
            navItems = await Promise.race([
              getNavForUser(user.id, profileForNav),
              new Promise<typeof mainNavItems>((_, reject) =>
                setTimeout(() => reject(new Error("Nav timeout")), 5000)
              ),
            ]);
          } catch {
            navItems = mainNavItems;
          }
        }

        return (
          <div className="min-h-screen flex flex-col">
            <TopNavbar userEmail={user.email} userName={userName} userRole={userRole} navItems={navItems} />
            <div className="flex flex-1">
              <Sidebar navItems={navItems} />
              <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
            </div>
          </div>
        );
      })(),
      LAYOUT_TIMEOUT_MS
    );
  } catch (err) {
    redirect("/login?error=supabase_timeout");
  }
  return content;
}
