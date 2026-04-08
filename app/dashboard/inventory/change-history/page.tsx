import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";
import { ChangeHistoryView } from "@/components/inventory/change-history-view";
import { getInventoryChangeHistory } from "./actions";
import { ITEM_CATEGORY_PRESET_LABELS } from "@/lib/inventory-change-history-presets";
import { decodeCsvTerms, parseIdList } from "@/lib/change-history-url-params";

export const dynamic = "force-dynamic";

function parseItemCat(param: string | undefined): string[] {
  if (!param || typeof param !== "string") return [];
  return param
    .split(",")
    .map((s) => s.trim())
    .filter((k) => k in ITEM_CATEGORY_PRESET_LABELS);
}

function uniqSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

export default async function ChangeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    include_inactive?: string;
    exclude_no_txn?: string;
    item_q?: string;
    category_q?: string;
    brand_q?: string;
    empties_q?: string;
    item_cat?: string;
    individual_location?: string;
    location_id?: string;
    location_ids?: string;
    item_ids?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const params = await searchParams;
  const fromParam = typeof params.from === "string" ? params.from : undefined;
  const toParam = typeof params.to === "string" ? params.to : undefined;
  const includeInactive = params.include_inactive === "1";
  const excludeNoTxn = params.exclude_no_txn === "1";
  const itemQ = typeof params.item_q === "string" ? params.item_q : "";
  const categoryQ = typeof params.category_q === "string" ? params.category_q : "";
  const brandQRaw = typeof params.brand_q === "string" ? params.brand_q : "";
  const emptiesQRaw = typeof params.empties_q === "string" ? params.empties_q : "";
  const itemCat = parseItemCat(params.item_cat);
  const individualLocation = params.individual_location === "1";

  const locationIds = parseIdList(
    typeof params.location_ids === "string" ? params.location_ids : params.location_id
  );
  const itemIds = parseIdList(typeof params.item_ids === "string" ? params.item_ids : undefined);

  const brandTerms = [...decodeCsvTerms(brandQRaw), ...decodeCsvTerms(categoryQ)].filter(
    (v, i, a) => a.indexOf(v) === i
  );
  const emptiesTerms = decodeCsvTerms(emptiesQRaw);

  const { data: orgRow } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const organizationName = (orgRow as { name?: string | null } | null)?.name?.trim() || null;

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, code, name, is_active")
    .eq("organization_id", orgId)
    .order("name");

  const { data: productRows } = await supabase
    .from("products")
    .select("id, code, name, category, empties_type, is_active")
    .eq("organization_id", orgId)
    .order("name");

  const productsForPicklist = (productRows ?? []).map((r) => ({
    id: String((r as { id: unknown }).id),
    code: (r as { code?: string | null }).code ?? null,
    name: String((r as { name?: string }).name ?? ""),
    is_active: (r as { is_active?: boolean | null }).is_active !== false,
  }));

  const categoryOptions = uniqSorted((productRows ?? []).map((r) => (r as { category?: string | null }).category));
  const emptiesTypeOptions = uniqSorted(
    (productRows ?? []).map((r) => (r as { empties_type?: string | null }).empties_type)
  );

  const { rows, from, to, error } = await getInventoryChangeHistory(orgId, fromParam, toParam, {
    includeInactive,
    excludeNoTransactions: excludeNoTxn,
    itemContains: itemQ.trim() || null,
    itemIds: itemIds.length > 0 ? itemIds : null,
    categoryContains: null,
    itemCategoryPresets: itemCat.length > 0 ? itemCat : null,
    brandTerms: brandTerms.length > 0 ? brandTerms : null,
    brandContains: null,
    emptiesTerms: emptiesTerms.length > 0 ? emptiesTerms : null,
    emptiesTypeContains: null,
    locationIds: locationIds.length > 0 ? locationIds : null,
  });

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col gap-0">
      <ChangeHistoryView
        rows={rows}
        from={from}
        to={to}
        error={error}
        includeInactive={includeInactive}
        excludeNoTransactions={excludeNoTxn}
        itemQ={itemQ}
        categoryQ={categoryQ}
        brandQ={brandQRaw}
        emptiesQ={emptiesQRaw}
        itemCatKeys={itemCat}
        individualLocation={individualLocation}
        locationIds={locationIds}
        itemIds={itemIds}
        brandTerms={brandTerms}
        emptiesTerms={emptiesTerms}
        organizationName={organizationName}
        locations={
          (locationRows ?? []) as Array<{
            id: string;
            code: string;
            name: string;
            is_active?: boolean | null;
          }>
        }
        productsForPicklist={productsForPicklist}
        categoryOptions={categoryOptions}
        emptiesTypeOptions={emptiesTypeOptions}
      />
    </div>
  );
}
