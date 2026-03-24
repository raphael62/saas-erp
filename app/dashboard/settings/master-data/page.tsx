import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MasterDataTable } from "@/components/settings/master-data-table";
import { requireOrgId } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

const TABLES = [
  "brand_categories",
  "empties_types",
  "price_types",
  "units_of_measure",
  "payment_methods",
  "location_types",
  "customer_groups",
  "customer_types",
] as const;

const TAB_IDS = [
  "brand-categories",
  "empties-types",
  "price-types",
  "units-of-measure",
  "payment-methods",
  "location-types",
  "customer-groups",
  "customer-types",
] as const;

export default async function MasterDataSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgId } = await requireOrgId();
  if (!orgId) return <NoOrgPrompt />;

  const supabase = await createClient();
  const params = await searchParams;
  const tabParam = params.tab ?? "brand-categories";
  const tabIndex = TAB_IDS.indexOf(tabParam as (typeof TAB_IDS)[number]);
  const activeTab = tabIndex >= 0 ? TAB_IDS[tabIndex] : "brand-categories";
  const tableName = TABLES[tabIndex >= 0 ? tabIndex : 0];

  let rows: { id: string; code: string; name: string; description: string | null; is_active: boolean; product_count?: number }[] = [];

  try {
    const { data, error } = await supabase
      .from(tableName)
      .select("id, code, name, description, is_active")
      .eq("organization_id", orgId)
      .order("code");

    if (!error && data) {
      rows = data as typeof rows;
    }
  } catch {
    // Table may not exist or RLS may block; show empty
  }

  if (tableName === "brand_categories") {
    const { data: prodData } = await supabase
      .from("products")
      .select("category")
      .eq("organization_id", orgId);
    const productCounts = (prodData ?? []).reduce(
      (acc: Record<string, number>, p: { category: string | null }) => {
        const cat = (p.category ?? "").trim();
        if (cat) acc[cat] = (acc[cat] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    rows = rows.map((r) => ({
      ...r,
      product_count: productCounts[r.name] ?? productCounts[r.code] ?? 0,
    }));
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Master Data Settings</span>
      </nav>

      {/* Title and description */}
      <div>
        <h1 className="text-2xl font-bold">Master Data Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage brand categories, empties types, price types, units of measure, payment methods, location types, customer groups, and customer types.
        </p>
      </div>

      <MasterDataTable activeTab={activeTab} rows={rows} tableName={tableName} />
    </div>
  );
}
