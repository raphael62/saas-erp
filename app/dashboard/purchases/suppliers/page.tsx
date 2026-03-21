import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SupplierList } from "@/components/purchases/supplier-list";

export default async function SuppliersPage() {
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

  const suppliersRes = await supabase
    .from("suppliers")
    .select(
      "id, code, name, category, tax_id, contact_person, phone, mobile, email, address, city, payment_terms, bank_name, bank_account, bank_branch, credit_limit, currency, supplier_status, notes, is_active"
    )
    .eq("organization_id", orgId)
    .order("code");

  const suppliers = suppliersRes.error ? [] : (suppliersRes.data ?? []);

  return (
    <div>
      <SupplierList suppliers={suppliers as Parameters<typeof SupplierList>[0]["suppliers"]} />
    </div>
  );
}
