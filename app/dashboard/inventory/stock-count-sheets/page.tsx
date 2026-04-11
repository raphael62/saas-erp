import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";
import { StockCountSheets } from "@/components/inventory/stock-count-sheets";
import { getUserTransactionScope, filterLocationsByScope } from "@/lib/user-transaction-scope";

export default async function StockCountSheetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const [sheetsRes, locationsRes, linesRes, productsRes, balancesRes, stockChecksRes] = await Promise.all([
    supabase
      .from("stock_count_sheets")
      .select("id, sheet_no, count_date, location_id, notes, location:locations!location_id(id, code, name)")
      .eq("organization_id", orgId)
      .order("count_date", { ascending: false })
      .order("sheet_no", { ascending: false }),
    supabase
      .from("locations")
      .select("id, code, name")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("stock_count_lines")
      .select("id, stock_count_sheet_id, product_id, cartons, bottles, ctn_qty, notes, row_no, product:products!product_id(id, code, name, pack_unit)")
      .eq("organization_id", orgId)
      .order("row_no"),
    supabase
      .from("products")
      .select("id, code, name, stock_quantity, unit, pack_unit")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("inventory_location_balances")
      .select("product_id, location_id, quantity")
      .eq("organization_id", orgId),
    supabase.from("stock_checks").select("id, stock_count_sheet_id").eq("organization_id", orgId),
  ]);

  const tableMissing = Boolean(
    sheetsRes.error &&
      (sheetsRes.error.message.toLowerCase().includes("does not exist") ||
        sheetsRes.error.message.toLowerCase().includes("schema cache"))
  );

  const lineRows = tableMissing ? [] : (linesRes.data ?? []);
  const sheets = tableMissing ? [] : (sheetsRes.data ?? []);
  const locsRaw = locationsRes.error ? [] : (locationsRes.data ?? []);
  const scope = await getUserTransactionScope(supabase, user.id, orgId);
  const locations = filterLocationsByScope(scope, locsRaw as Array<{ id: string; code?: string | null; name: string }>);
  const products = productsRes.error ? [] : (productsRes.data ?? []);
  const balancesRaw = balancesRes.error ? [] : (balancesRes.data ?? []);
  const locationBalances =
    scope.unrestricted || !scope.restrictByLocation
      ? balancesRaw
      : (balancesRaw as Array<{ location_id?: string }>).filter((b) =>
          scope.allowedLocationIds.includes(String(b.location_id ?? ""))
        );
  const stockCheckIdBySheetId: Record<string, string> = {};
  if (!stockChecksRes.error && stockChecksRes.data) {
    for (const sc of stockChecksRes.data as Array<{ id?: string; stock_count_sheet_id?: string }>) {
      const sid = String(sc.stock_count_sheet_id ?? "");
      const cid = String(sc.id ?? "");
      if (sid && cid) stockCheckIdBySheetId[sid] = cid;
    }
  }
  const linesBySheet = new Map<string, unknown[]>();
  for (const l of lineRows as Array<{ stock_count_sheet_id?: string }>) {
    const key = String(l.stock_count_sheet_id ?? "");
    if (!key) continue;
    const arr = linesBySheet.get(key) ?? [];
    arr.push(l as unknown);
    linesBySheet.set(key, arr);
  }

  const normalizedSheets = sheets.map((s: unknown) => {
    const row = s as {
      location?: unknown;
      [key: string]: unknown;
    };
    const loc = Array.isArray(row.location) ? row.location[0] : row.location;
    const { location, ...rest } = row;
    return {
      ...rest,
      location: loc,
      lines: linesBySheet.get(String(row.id ?? "")) ?? [],
    };
  });

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">
          Dashboard
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/dashboard/inventory" className="hover:text-foreground">
          Inventory
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Stock Count Sheets</span>
      </nav>

      <StockCountSheets
        sheets={normalizedSheets as Parameters<typeof StockCountSheets>[0]["sheets"]}
        locations={locations as Parameters<typeof StockCountSheets>[0]["locations"]}
        products={products as Parameters<typeof StockCountSheets>[0]["products"]}
        locationBalances={locationBalances as Parameters<typeof StockCountSheets>[0]["locationBalances"]}
        stockCheckIdBySheetId={stockCheckIdBySheetId}
        tableMissing={tableMissing}
      />
    </div>
  );
}
