import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PriceList } from "@/components/sales/price-list";

export default async function PriceListPage() {
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
        <p className="text-muted-foreground">Loading organization…</p>
      </div>
    );
  }

  const productsRes = await supabase
    .from("products")
    .select("id, code, name, category, pack_unit, unit, is_active")
    .eq("organization_id", orgId)
    .order("name");

  const priceTypesRes = await supabase
    .from("price_types")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("code");

  const priceListsRes = await supabase
    .from("price_lists")
    .select("id, name, price_type_id, effective_date, expiry_date, notes, is_active, created_at, price_types(id, code, name)")
    .eq("organization_id", orgId)
    .order("effective_date", { ascending: false });

  const priceListItemsRes = await supabase
    .from("price_list_items")
    .select("id, price_list_id, product_id, price, tax_rate, vat_type")
    .eq("organization_id", orgId);

  const missingPriceListTables =
    (priceListsRes.error && priceListsRes.error.message.toLowerCase().includes("does not exist")) ||
    (priceListItemsRes.error && priceListItemsRes.error.message.toLowerCase().includes("does not exist"));

  if (missingPriceListTables) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">Price List</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Price list tables are missing. Run `supabase/ADD_PRICE_LISTS.sql`, then refresh this page.
        </p>
      </div>
    );
  }

  const products = productsRes.error ? [] : (productsRes.data ?? []);
  const priceTypes = priceTypesRes.error ? [] : (priceTypesRes.data ?? []);
  const priceLists = priceListsRes.error ? [] : (priceListsRes.data ?? []);
  const priceListItems = priceListItemsRes.error ? [] : (priceListItemsRes.data ?? []);

  return (
    <div>
      <PriceList
        products={products as Parameters<typeof PriceList>[0]["products"]}
        priceTypes={priceTypes as Parameters<typeof PriceList>[0]["priceTypes"]}
        priceLists={priceLists as unknown as Parameters<typeof PriceList>[0]["priceLists"]}
        priceListItems={priceListItems as Parameters<typeof PriceList>[0]["priceListItems"]}
      />
    </div>
  );
}
