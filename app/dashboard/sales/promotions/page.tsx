import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PromotionList } from "@/components/sales/promotion-list";

export default async function PromotionsPage() {
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

  const promotionsRes = await supabase
    .from("promotions")
    .select(
      "id, promo_code, name, promo_budget_cartons, consumed_cartons, start_date, end_date, description, is_active, eligible_price_types, eligible_location_ids, days_of_week, happy_hour_start, happy_hour_end, created_at"
    )
    .eq("organization_id", orgId)
    .order("start_date", { ascending: false });

  const rulesRes = await supabase
    .from("promotion_rules")
    .select(
      "id, promotion_id, buy_product_id, buy_qty, buy_unit, reward_product_id, reward_qty, reward_unit, row_no"
    )
    .eq("organization_id", orgId)
    .order("row_no", { ascending: true });

  const productsRes = await supabase
    .from("products")
    .select("id, code, name, unit, pack_unit, is_active")
    .eq("organization_id", orgId)
    .order("code");

  const priceTypesRes = await supabase
    .from("price_types")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("code");

  const locationsRes = await supabase
    .from("locations")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("code");

  const tableMissing =
    (promotionsRes.error && promotionsRes.error.message.toLowerCase().includes("does not exist")) ||
    (rulesRes.error && rulesRes.error.message.toLowerCase().includes("does not exist"));

  if (tableMissing) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">Promotions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Promotions tables are missing. Run `supabase/ADD_PROMOTIONS.sql`, then refresh this page.
        </p>
      </div>
    );
  }

  return (
    <PromotionList
      promotions={(promotionsRes.error ? [] : promotionsRes.data ?? []) as Parameters<typeof PromotionList>[0]["promotions"]}
      rules={(rulesRes.error ? [] : rulesRes.data ?? []) as Parameters<typeof PromotionList>[0]["rules"]}
      products={(productsRes.error ? [] : productsRes.data ?? []) as Parameters<typeof PromotionList>[0]["products"]}
      priceTypes={(priceTypesRes.error ? [] : priceTypesRes.data ?? []) as Parameters<typeof PromotionList>[0]["priceTypes"]}
      locations={(locationsRes.error ? [] : locationsRes.data ?? []) as Parameters<typeof PromotionList>[0]["locations"]}
    />
  );
}
