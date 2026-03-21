import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CustomerStatement } from "@/components/sales/customer-statement";

export default async function CustomerStatementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id?: string } | null)?.organization_id;
  if (!orgId) {
    return (
      <div>
        <p className="text-muted-foreground">Loading organization...</p>
      </div>
    );
  }

  const orgRes = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  const orgName = String((orgRes.data as { name?: string } | null)?.name ?? "");

  return (
    <div>
      <CustomerStatement orgName={orgName} />
    </div>
  );
}
