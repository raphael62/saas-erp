import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SalesRepList } from "@/components/sales/sales-rep-list";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

export default async function SalesRepsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const [repsRes, locationsRes] = await Promise.all([
    supabase
      .from("sales_reps")
      .select("id, name, code, first_name, last_name, sales_rep_type, phone, email, location, is_active")
      .eq("organization_id", orgId)
      .order("name"),
    supabase
      .from("locations")
      .select("id, code, name")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("code"),
  ]);
  const salesReps = repsRes.data ?? [];
  const locations = (locationsRes.data ?? []) as Array<{ id: string; code?: string | null; name: string }>;

  return (
    <div>
      <SalesRepList salesReps={salesReps} locations={locations} />
    </div>
  );
}
