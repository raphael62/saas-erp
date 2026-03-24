import { createClient } from "@/lib/supabase/server";
import { CustomerList } from "@/components/sales/customer-list";
import { requireOrgId } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

export default async function CustomersPage() {
  const { orgId } = await requireOrgId();
  if (!orgId) return <NoOrgPrompt />;

  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, contact_person, email, phone, address, tax_id, credit_limit, payment_terms, customer_type, price_type, sales_rep_id, is_active, sales_reps(id, name)")
    .eq("organization_id", orgId)
    .order("name");

  const salesRepsRes = await supabase
    .from("sales_reps")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");
  const salesReps = salesRepsRes.error ? [] : (salesRepsRes.data ?? []);

  const customerTypesRes = await supabase
    .from("customer_types")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");
  const customerTypes = customerTypesRes.error ? [] : (customerTypesRes.data ?? []);

  const priceTypesRes = await supabase
    .from("price_types")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");
  const priceTypes = priceTypesRes.error ? [] : (priceTypesRes.data ?? []);

  return (
    <div>
      <CustomerList
        customers={(customers ?? []) as unknown as Parameters<typeof CustomerList>[0]["customers"]}
        salesReps={salesReps}
        customerTypes={customerTypes}
        priceTypes={priceTypes}
      />
    </div>
  );
}
