import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LoadOutSheetList } from "@/components/sales/load-out-sheet-list";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

export default async function LoadOutSheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const editId = typeof params.edit === "string" ? params.edit : undefined;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const sheetsRes = await supabase
    .from("load_out_sheets")
    .select(
      "id, sheet_no, sales_rep_id, location_id, sales_date, vehicle_no, driver_name, daily_target, customer_id, status, notes, total_loadout_qty, total_van_sales_qty, total_sales_value, sales_reps(id, code, name), locations(id, code, name), customers(id, name, price_type)"
    )
    .eq("organization_id", orgId)
    .order("sales_date", { ascending: false });

  const linesRes = await supabase
    .from("load_out_sheet_lines")
    .select(
      "id, load_out_sheet_id, product_id, product_code_snapshot, product_name_snapshot, unit, source_request_no, load_out_qty, top_up_qty, second_load_qty, add_req_qty, van_stocks_qty, returns_qty, van_sales_qty, unit_price, sales_value, row_no"
    )
    .eq("organization_id", orgId)
    .order("row_no");

  const repsRes = await supabase
    .from("sales_reps")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");

  const locationsRes = await supabase
    .from("locations")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("code");

  const vsrRes = await supabase
    .from("sales_vsr_monthly_targets")
    .select("id, sales_rep_id, month_start, customer_id, customers(id, name, price_type)")
    .eq("organization_id", orgId);

  const priceListsRes = await supabase
    .from("price_lists")
    .select("id, effective_date, expiry_date, is_active, price_types(name)")
    .eq("organization_id", orgId)
    .eq("is_active", true);

  const priceListItemsRes = await supabase
    .from("price_list_items")
    .select("price_list_id, product_id, price")
    .eq("organization_id", orgId);

  const vsrLinesRes = await supabase
    .from("sales_vsr_monthly_target_lines")
    .select("vsr_monthly_target_id, product_id, target_qty")
    .eq("organization_id", orgId);

  const productsRes = await supabase
    .from("products")
    .select("id, unit, pack_unit, category")
    .eq("organization_id", orgId);

  const missing =
    (sheetsRes.error && sheetsRes.error.message.toLowerCase().includes("does not exist")) ||
    (linesRes.error && linesRes.error.message.toLowerCase().includes("does not exist")) ||
    (priceListsRes.error && priceListsRes.error.message.toLowerCase().includes("does not exist")) ||
    (priceListItemsRes.error && priceListItemsRes.error.message.toLowerCase().includes("does not exist"));

  if (missing) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">Load Out Sheets</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Run the migration <code className="rounded bg-muted px-1">supabase/migrations/013_van_stock_requests_load_out.sql</code>{" "}
          in the Supabase SQL editor, then refresh.
        </p>
      </div>
    );
  }

  const sheets = sheetsRes.error ? [] : sheetsRes.data ?? [];
  const lines = linesRes.error ? [] : linesRes.data ?? [];
  const reps = repsRes.error ? [] : repsRes.data ?? [];
  const locations = locationsRes.error ? [] : locationsRes.data ?? [];
  const vsrTargets = vsrRes.error ? [] : vsrRes.data ?? [];
  const vsrLines = vsrLinesRes.error ? [] : vsrLinesRes.data ?? [];
  const priceLists = priceListsRes.error ? [] : priceListsRes.data ?? [];
  const priceListItems = priceListItemsRes.error ? [] : priceListItemsRes.data ?? [];
  const products = productsRes.error ? [] : productsRes.data ?? [];

  return (
    <div className="space-y-4">
      <nav className="text-muted-foreground text-sm">
        <Link href="/dashboard/sales" className="hover:text-foreground">
          Sales
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Load Out Sheets</span>
      </nav>
      <LoadOutSheetList
        sheets={sheets as unknown as Parameters<typeof LoadOutSheetList>[0]["sheets"]}
        lines={lines as Parameters<typeof LoadOutSheetList>[0]["lines"]}
        reps={reps as Parameters<typeof LoadOutSheetList>[0]["reps"]}
        locations={locations as Parameters<typeof LoadOutSheetList>[0]["locations"]}
        vsrTargets={vsrTargets as Parameters<typeof LoadOutSheetList>[0]["vsrTargets"]}
        vsrLines={vsrLines as Parameters<typeof LoadOutSheetList>[0]["vsrLines"]}
        priceLists={priceLists as Parameters<typeof LoadOutSheetList>[0]["priceLists"]}
        priceListItems={priceListItems as Parameters<typeof LoadOutSheetList>[0]["priceListItems"]}
        products={products as Parameters<typeof LoadOutSheetList>[0]["products"]}
        editId={editId}
      />
    </div>
  );
}
