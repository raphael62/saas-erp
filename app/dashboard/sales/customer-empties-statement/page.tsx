import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CustomerEmptiesStatement } from "@/components/sales/customer-empties-statement";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

export default async function CustomerEmptiesStatementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const orgRes = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  const orgName = String((orgRes.data as { name?: string } | null)?.name ?? "");

  return (
    <div>
      <CustomerEmptiesStatement orgName={orgName} />
    </div>
  );
}
