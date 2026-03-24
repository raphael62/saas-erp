import { createClient } from "@/lib/supabase/server";
import { SupplierList } from "@/components/purchases/supplier-list";
import { requireOrgId } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

export default async function SuppliersPage() {
  const { orgId } = await requireOrgId();
  if (!orgId) return <NoOrgPrompt />;

  const supabase = await createClient();
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
