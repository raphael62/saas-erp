import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SalesRepList } from "@/components/sales/sales-rep-list";

export default async function SalesRepsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id?: string } | null)?.organization_id;
  if (!orgId) {
    return <div><p className="text-muted-foreground">Loading organization…</p></div>;
  }

  const { data } = await supabase
    .from("sales_reps")
    .select("id, name, code, first_name, last_name, sales_rep_type, phone, email, location, is_active")
    .eq("organization_id", orgId)
    .order("name");
  const salesReps = data ?? [];

  return (
    <div>
      <SalesRepList salesReps={salesReps} />
    </div>
  );
}
