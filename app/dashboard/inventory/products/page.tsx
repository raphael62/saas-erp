import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProductList } from "@/components/inventory/product-list";

export default async function InventoryProductsPage() {
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
    return (
      <div>
        <p className="text-muted-foreground">Loading organization…</p>
      </div>
    );
  }

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");

  const categoriesRes = await supabase.from("brand_categories").select("id, code, name").eq("organization_id", orgId).eq("is_active", true).order("code");
  const unitsRes = await supabase.from("units_of_measure").select("id, code, name").eq("organization_id", orgId).eq("is_active", true).order("code");
  const suppliersRes = await supabase.from("suppliers").select("id, name").eq("organization_id", orgId).order("name");
  const emptiesRes = await supabase.from("empties_types").select("id, code, name").eq("organization_id", orgId).eq("is_active", true).order("code");

  const categories = categoriesRes.error ? [] : (categoriesRes.data ?? []);
  const units = unitsRes.error ? [] : (unitsRes.data ?? []);
  const suppliers = suppliersRes.error ? [] : (suppliersRes.data ?? []);
  const emptiesTypes = emptiesRes.error ? [] : (emptiesRes.data ?? []);

  return (
    <div>
      <ProductList
        products={(products ?? []) as Parameters<typeof ProductList>[0]["products"]}
        categories={categories as { id: string; code?: string; name: string }[]}
        units={units as { id: string; code?: string; name: string }[]}
        suppliers={suppliers as { id: string; name: string }[]}
        emptiesTypes={emptiesTypes as { id: string; code?: string; name: string }[]}
      />
    </div>
  );
}
