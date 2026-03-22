import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewPOSSale } from "@/components/pos/new-pos-sale";
import { SsrTargets } from "@/components/pos/ssr-targets";
import { ParkedSalesList } from "@/components/pos/parked-sales-list";
import { DailyPaymentsView } from "@/components/pos/daily-payments-view";
import { ShopPerformanceReport } from "@/components/pos/shop-performance-report";

type PosSectionDef = {
  label: string;
  hint: string;
};

const SECTION_MAP: Record<string, PosSectionDef> = {
  "new-sale": {
    label: "New Sale",
    hint: "Start and process a fresh point-of-sale transaction.",
  },
  parked: {
    label: "Parked",
    hint: "Review and resume parked bills and pending carts.",
  },
  "daily-payments": {
    label: "Daily Payments",
    hint: "Track daily collections and payment method totals.",
  },
  targets: {
    label: "Targets",
    hint: "View POS targets for outlets, reps, and counters.",
  },
  performance: {
    label: "Performance",
    hint: "Monitor sales pace and operational performance trends.",
  },
  achievements: {
    label: "Achievements",
    hint: "See completed goals and milestone status.",
  },
  "monthly-review": {
    label: "Monthly Review",
    hint: "Summarize monthly POS outcomes and key metrics.",
  },
};

export default async function POSSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const def = SECTION_MAP[section];
  if (!def) notFound();

  if (section === "new-sale") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase.from("profiles").select("organization_id, full_name").eq("id", user.id).single();
    const orgId = (profile as { organization_id?: string } | null)?.organization_id;
    const cashierName = (profile as { full_name?: string } | null)?.full_name ?? user.email ?? "Cashier";
    if (!orgId) {
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-semibold">New POS Sale</h1>
          <p className="text-muted-foreground">Loading organization…</p>
        </div>
      );
    }

    const orgRes = await supabase.from("organizations").select("name, phone").eq("id", orgId).single();
    const orgName = (orgRes.data as { name?: string } | null)?.name ?? "";
    const orgPhone = (orgRes.data as { phone?: string } | null)?.phone ?? "";

    const fetchSafe = async <T,>(fn: () => PromiseLike<{ data: T[] | null; error: unknown }>) => {
      try {
        const res = await fn();
        return { data: res.error ? [] : (res.data ?? []), error: res.error };
      } catch {
        return { data: [], error: null };
      }
    };

    const [customersRes, repsRes, locationsRes, productsRes, priceTypesRes, priceListsRes, priceListItemsRes, promotionsRes, promotionRulesRes, ssrRes, paymentAccountsRes, paymentMethodsRes] = await Promise.all([
      fetchSafe(() => supabase.from("customers").select("id, tax_id, name").eq("organization_id", orgId).eq("is_active", true).order("name")),
      fetchSafe(() => supabase.from("sales_reps").select("id, code, name").eq("organization_id", orgId).eq("is_active", true).order("name")),
      fetchSafe(() => supabase.from("locations").select("id, code, name, phone").eq("organization_id", orgId).eq("is_active", true).order("code")),
      fetchSafe(() => supabase.from("products").select("id, code, name, category, pack_unit, unit, stock_quantity, empties_type, returnable").eq("organization_id", orgId).order("code")),
      fetchSafe(() => supabase.from("price_types").select("id, code, name").eq("organization_id", orgId).eq("is_active", true).order("code")),
      fetchSafe(() => supabase.from("price_lists").select("id, price_type_id, effective_date, expiry_date, is_active, price_types(name)").eq("organization_id", orgId).eq("is_active", true)),
      fetchSafe(() => supabase.from("price_list_items").select("price_list_id, product_id, price, tax_rate, vat_type").eq("organization_id", orgId)),
      fetchSafe(() => supabase.from("promotions").select("id, promo_code, name, start_date, end_date, promo_budget_cartons, consumed_cartons, eligible_price_types, eligible_location_ids, days_of_week").eq("organization_id", orgId).eq("is_active", true)),
      fetchSafe(() => supabase.from("promotion_rules").select("promotion_id, buy_product_id, buy_qty, buy_unit, reward_product_id, reward_qty, reward_unit, row_no").eq("organization_id", orgId).order("row_no")),
      fetchSafe(() => supabase.from("sales_ssr_monthly_targets").select("id, sales_rep_id, month_start, target_value, commission_pct").eq("organization_id", orgId).order("month_start", { ascending: false })),
      fetchSafe(() => supabase.from("payment_accounts").select("id, code, name, account_type").eq("organization_id", orgId).eq("is_active", true).order("code")),
      fetchSafe(() => supabase.from("payment_methods").select("id, code, name").eq("organization_id", orgId).eq("is_active", true).order("name")),
    ]);

    const promotionRulesData = promotionRulesRes.data;
    const priceTypes = (priceTypesRes.data ?? []) as Array<{ name?: string }>;

    // Ensure empties products (e.g. Physical Empties) are in the list for sale/refund
    const baseProducts = (productsRes.data ?? []) as Array<{ id: string; code?: string | null; name: string }>;
    const emptiesRes = await fetchSafe(() =>
      supabase.from("products").select("id, code, name, category, pack_unit, unit, stock_quantity, empties_type, returnable").eq("organization_id", orgId).ilike("name", "%empties%")
    );
    const emptiesProducts = (emptiesRes.data ?? []) as typeof baseProducts;
    const seenIds = new Set(baseProducts.map((p) => String(p.id)));
    const productsMerged = [...baseProducts];
    for (const p of emptiesProducts) {
      if (!seenIds.has(String(p.id))) {
        seenIds.add(String(p.id));
        productsMerged.push(p);
      }
    }
    productsMerged.sort((a, b) => String(a.code ?? a.name ?? "").localeCompare(String(b.code ?? b.name ?? "")));

    const retailPriceType = priceTypes.find((pt) =>
      String(pt.name ?? "").toLowerCase().includes("retail")
    );
    const defaultPriceType = retailPriceType?.name ?? priceTypes[0]?.name ?? "Retail Price";

    return (
      <div className="min-h-[400px] space-y-4">
        <NewPOSSale
          customers={(customersRes.data ?? []) as Parameters<typeof NewPOSSale>[0]["customers"]}
          salesReps={(repsRes.data ?? []) as Parameters<typeof NewPOSSale>[0]["salesReps"]}
          locations={(locationsRes.data ?? []) as Parameters<typeof NewPOSSale>[0]["locations"]}
          products={productsMerged as Parameters<typeof NewPOSSale>[0]["products"]}
          priceTypes={priceTypes as Parameters<typeof NewPOSSale>[0]["priceTypes"]}
          priceLists={(priceListsRes.data ?? []) as Parameters<typeof NewPOSSale>[0]["priceLists"]}
          priceListItems={(priceListItemsRes.data ?? []) as Parameters<typeof NewPOSSale>[0]["priceListItems"]}
          promotions={(promotionsRes.data ?? []) as Parameters<typeof NewPOSSale>[0]["promotions"]}
          promotionRules={(promotionRulesData ?? []) as Parameters<typeof NewPOSSale>[0]["promotionRules"]}
          ssrTargets={(ssrRes.data ?? []) as Parameters<typeof NewPOSSale>[0]["ssrTargets"]}
          parkedSales={[]}
          defaultPriceType={defaultPriceType}
          orgName={orgName}
          orgPhone={orgPhone}
          cashierName={cashierName}
          paymentAccounts={Array.isArray(paymentAccountsRes?.data) ? paymentAccountsRes.data : []}
          paymentMethods={Array.isArray(paymentMethodsRes?.data) ? paymentMethodsRes.data : []}
        />
      </div>
    );
  }

  if (section === "daily-payments") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
    const orgId = (profile as { organization_id?: string } | null)?.organization_id;
    const locations = orgId
      ? ((await supabase.from("locations").select("id, code, name").eq("organization_id", orgId).eq("is_active", true).order("code")).data ?? [])
      : [];

    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Daily Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Payment accounts and daily collection summary.
          </p>
        </div>
        <DailyPaymentsView locations={locations as Array<{ id: string; code?: string | null; name: string }>} />
      </div>
    );
  }

  if (section === "parked") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
    const orgId = (profile as { organization_id?: string } | null)?.organization_id;
    if (!orgId) {
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-semibold">Parked Sales</h1>
          <p className="text-muted-foreground">Loading organization…</p>
        </div>
      );
    }

    const [customersRes, locationsRes] = await Promise.all([
      supabase.from("customers").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("name"),
      supabase.from("locations").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("code"),
    ]);
    const customers = (customersRes.data ?? []) as Array<{ id: string; name: string }>;
    const locations = (locationsRes.data ?? []) as Array<{ id: string; name: string }>;

    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Parked Sales</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Resume or delete parked bills.
          </p>
        </div>
        <ParkedSalesList customers={customers} locations={locations} />
      </div>
    );
  }

  if (section === "targets") {
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

    const repsRes = await supabase
      .from("sales_reps")
      .select("id, code, name, sales_rep_type, is_active")
      .eq("organization_id", orgId)
      .order("name");

    const missing = ssrRes.error && ssrRes.error.message.toLowerCase().includes("does not exist");
    if (missing) {
      return (
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">POS Targets</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Run the migration <code className="rounded bg-muted px-1">supabase/migrations/014_sales_targets.sql</code>{" "}
            in the Supabase SQL editor, then refresh.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Point of Sale</h1>
          <p className="mt-1 text-sm text-muted-foreground">POS targets workspace.</p>
        </div>
        <SsrTargets
          ssrTargets={(ssrRes.data ?? []) as unknown as Parameters<typeof SsrTargets>[0]["ssrTargets"]}
          reps={(repsRes.data ?? []) as Parameters<typeof SsrTargets>[0]["reps"]}
        />
      </div>
    );
  }

  if (section === "performance") {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
    const orgId = (profile as { organization_id?: string } | null)?.organization_id;
    if (!orgId) {
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-semibold">Shop Performance Report</h1>
          <p className="text-muted-foreground">Loading organization…</p>
        </div>
      );
    }

    const repsRes = await supabase
      .from("sales_reps")
      .select("id, code, name")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name");

    const reps = (repsRes.data ?? []) as Array<{ id: string; code?: string | null; name: string }>;

    return (
      <div className="space-y-4">
        <ShopPerformanceReport reps={reps} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Point of Sale</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          POS operations workspace.
        </p>
      </div>

      <div className="rounded border border-border bg-card p-4">
        <h2 className="text-base font-semibold">{def.label}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{def.hint}</p>
      </div>
    </div>
  );
}

