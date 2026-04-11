import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";
import { StockByLocationView } from "@/components/inventory/stock-by-location-view";
import { getUserTransactionScope, filterLocationsByScope } from "@/lib/user-transaction-scope";

export const dynamic = "force-dynamic";

function uniqSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

export default async function StockByLocationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const generatedAtIso = new Date().toISOString();

  const [productsRes, locationsRes, balancesRes] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, code, name, category, pack_unit, min_stock, reorder_qty, cost_price, empties_type, is_active"
      )
      .eq("organization_id", orgId)
      .or("is_active.eq.true,is_active.is.null")
      .order("code"),
    supabase
      .from("locations")
      .select("id, code, name, is_active")
      .eq("organization_id", orgId)
      .or("is_active.eq.true,is_active.is.null")
      .order("code"),
    supabase
      .from("inventory_location_balances")
      .select("product_id, location_id, quantity")
      .eq("organization_id", orgId),
  ]);

  const productRows = (productsRes.data ?? []) as Array<{
    id: string;
    code: string | null;
    name: string;
    category: string | null;
    pack_unit: number | null;
    min_stock: number | null;
    reorder_qty: number | null;
    cost_price: number | null;
    empties_type: string | null;
  }>;

  const products = productRows.map((r) => ({
    id: String(r.id),
    code: r.code,
    name: r.name,
    category: r.category,
    pack_unit: r.pack_unit,
    min_stock: Number(r.min_stock ?? 0),
    reorder_qty: Number(r.reorder_qty ?? 0),
    cost_price: Number(r.cost_price ?? 0),
    empties_type: r.empties_type,
  }));

  const productsForPicklist = productRows.map((r) => ({
    id: String(r.id),
    code: r.code,
    name: r.name,
    is_active: true,
  }));

  const categoryOptions = uniqSorted(productRows.map((r) => r.category));
  const emptiesTypeOptions = uniqSorted(productRows.map((r) => r.empties_type));

  const locsRaw = (locationsRes.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    is_active?: boolean | null;
  }>;
  const scope = await getUserTransactionScope(supabase, user.id, orgId);
  const locationsFiltered = filterLocationsByScope(scope, locsRaw.map((l) => ({ ...l, id: String(l.id) })));
  const locations = locationsFiltered.map((l) => ({ ...l, id: String(l.id) }));

  const balancesTableMissing = Boolean(
    balancesRes.error &&
      (balancesRes.error.message.toLowerCase().includes("does not exist") ||
        balancesRes.error.message.toLowerCase().includes("schema cache"))
  );

  const dataLoadError = [productsRes.error, locationsRes.error]
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .map((e) => e.message)
    .join(" · ") || null;

  const balancesRaw = balancesTableMissing
    ? []
    : ((balancesRes.data ?? []) as Array<{
        product_id: string;
        location_id: string;
        quantity: number | string | null;
      }>).map((b) => ({
        product_id: String(b.product_id),
        location_id: String(b.location_id),
        quantity: Number(b.quantity ?? 0),
      }));
  const balances =
    balancesTableMissing || scope.unrestricted || !scope.restrictByLocation
      ? balancesRaw
      : balancesRaw.filter((b) => scope.allowedLocationIds.includes(b.location_id));

  return (
    <StockByLocationView
      products={products}
      locations={locations}
      balances={balances}
      productsForPicklist={productsForPicklist}
      categoryOptions={categoryOptions}
      emptiesTypeOptions={emptiesTypeOptions}
      generatedAtIso={generatedAtIso}
      balancesTableMissing={balancesTableMissing}
      dataLoadError={dataLoadError}
    />
  );
}
