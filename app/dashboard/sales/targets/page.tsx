import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SalesTargets } from "@/components/sales/sales-targets";

export default async function SalesTargetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  const orgId = (profile as { organization_id?: string } | null)?.organization_id;
  if (!orgId) {
    return (
      <div>
        <p className="text-muted-foreground">Loading organization...</p>
      </div>
    );
  }

  const ssrRes = await supabase
    .from("sales_ssr_monthly_targets")
    .select("id, sales_rep_id, month_start, target_value, commission_pct, notes, sales_reps(id, code, name)")
    .eq("organization_id", orgId)
    .order("month_start", { ascending: false });

  const vsrRes = await supabase
    .from("sales_vsr_monthly_targets")
    .select("id, sales_rep_id, month_start, commission_pct, notes, customer_id, sales_reps(id, code, name), customers(id, name)")
    .eq("organization_id", orgId)
    .order("month_start", { ascending: false });

  const vsrLinesRes = await supabase
    .from("sales_vsr_monthly_target_lines")
    .select("id, vsr_monthly_target_id, product_id, target_qty, target_value, unit_price, row_no, products(id, code, name)")
    .eq("organization_id", orgId)
    .order("row_no");

  const priceListsRes = await supabase
    .from("price_lists")
    .select("id, effective_date, expiry_date, is_active, price_types(name)")
    .eq("organization_id", orgId)
    .eq("is_active", true);

  const priceListItemsRes = await supabase
    .from("price_list_items")
    .select("price_list_id, product_id, price")
    .eq("organization_id", orgId);

  const repsRes = await supabase
    .from("sales_reps")
    .select("id, code, name, sales_rep_type, is_active")
    .eq("organization_id", orgId)
    .order("name");

  const productsRes = await supabase.from("products").select("id, code, name").eq("organization_id", orgId).order("name");

  const customersRes = await supabase
    .from("customers")
    .select("id, tax_id, name, price_type")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");

  const missing =
    (ssrRes.error && ssrRes.error.message.toLowerCase().includes("does not exist")) ||
    (vsrRes.error && vsrRes.error.message.toLowerCase().includes("does not exist")) ||
    (vsrLinesRes.error && vsrLinesRes.error.message.toLowerCase().includes("does not exist")) ||
    (priceListsRes.error && priceListsRes.error.message.toLowerCase().includes("does not exist")) ||
    (priceListItemsRes.error && priceListItemsRes.error.message.toLowerCase().includes("does not exist"));

  if (missing) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">Sales Targets</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Run the migration <code className="rounded bg-muted px-1">supabase/migrations/014_sales_targets.sql</code> in
          the Supabase SQL editor, then refresh.
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const retailLists = (priceListsRes.data ?? [])
    .filter((pl) => {
      const typeName = String((pl as { price_types?: { name?: string | null } | null }).price_types?.name ?? "")
        .trim()
        .toLowerCase();
      if (!typeName.includes("retail")) return false;
      const eff = String((pl as { effective_date?: string | null }).effective_date ?? "0000-01-01");
      const exp = String((pl as { expiry_date?: string | null }).expiry_date ?? "");
      if (eff > today) return false;
      if (exp && exp < today) return false;
      return true;
    })
    .sort((a, b) => {
      const da = String((a as { effective_date?: string | null }).effective_date ?? "");
      const db = String((b as { effective_date?: string | null }).effective_date ?? "");
      return db.localeCompare(da);
    });

  const itemByListAndProduct = new Map<string, number>();
  for (const item of priceListItemsRes.data ?? []) {
    const key = `${String((item as { price_list_id?: string }).price_list_id ?? "")}|${String(
      (item as { product_id?: string | number }).product_id ?? ""
    )}`;
    const price = Number((item as { price?: number | null }).price ?? 0);
    itemByListAndProduct.set(key, Number.isFinite(price) ? price : 0);
  }

  const currentRetailPrices: Record<string, number> = {};
  const productIds = new Set((productsRes.data ?? []).map((p) => String((p as { id: string | number }).id)));
  for (const pid of productIds) {
    for (const list of retailLists) {
      const v = itemByListAndProduct.get(`${String((list as { id?: string }).id ?? "")}|${pid}`);
      if (typeof v === "number") {
        currentRetailPrices[pid] = v;
        break;
      }
    }
  }

  return (
    <div className="space-y-4">
      <nav className="text-muted-foreground text-sm">
        <Link href="/dashboard/sales" className="hover:text-foreground">
          Sales
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Sales Targets</span>
      </nav>
      <SalesTargets
        ssrTargets={(ssrRes.data ?? []) as unknown as Parameters<typeof SalesTargets>[0]["ssrTargets"]}
        vsrTargets={(vsrRes.data ?? []) as unknown as Parameters<typeof SalesTargets>[0]["vsrTargets"]}
        vsrLines={(vsrLinesRes.data ?? []) as unknown as Parameters<typeof SalesTargets>[0]["vsrLines"]}
        reps={(repsRes.data ?? []) as Parameters<typeof SalesTargets>[0]["reps"]}
        products={(productsRes.data ?? []) as Parameters<typeof SalesTargets>[0]["products"]}
        customers={(customersRes.data ?? []) as Parameters<typeof SalesTargets>[0]["customers"]}
        priceLists={(priceListsRes.data ?? []) as Parameters<typeof SalesTargets>[0]["priceLists"]}
        priceListItems={(priceListItemsRes.data ?? []) as Parameters<typeof SalesTargets>[0]["priceListItems"]}
        currentRetailPrices={currentRetailPrices}
        showSSR={false}
      />
    </div>
  );
}
