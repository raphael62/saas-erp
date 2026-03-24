import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SupplierStatement } from "@/components/purchases/supplier-statement";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

export default async function SupplierStatementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const orgRes = await supabase.from("organizations").select("name").eq("id", orgId).single();
  const orgName = String((orgRes.data as { name?: string } | null)?.name ?? "");

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">
          Dashboard
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/dashboard/purchases" className="hover:text-foreground">
          Purchases
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Supplier Statement</span>
      </nav>

      <SupplierStatement orgName={orgName} />
    </div>
  );
}
