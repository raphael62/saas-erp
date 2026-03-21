import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SalesInvoiceList } from "@/components/sales/sales-invoice-list";

export default async function SalesInvoicesPage({
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id?: string } | null)?.organization_id;
  if (!orgId) {
    return (
      <div>
        <p className="text-muted-foreground">Loading organization...</p>
      </div>
    );
  }

  const invoicesRes = await supabase
    .from("sales_invoices")
    .select(
      "id, invoice_no, customer_id, sales_rep_id, location_id, invoice_date, delivery_date, vat_invoice_no, driver_name, vehicle_no, payment_terms, type_status, notes, balance_os, total_qty, sub_total, tax_total, grand_total, posted_at, posted_by, created_at, customers(id, name), sales_reps(id, name), locations(id, code, name)"
    )
    .eq("organization_id", orgId)
    .order("invoice_date", { ascending: false });

  const linesRes = await supabase
    .from("sales_invoice_lines")
    .select(
      "id, sales_invoice_id, product_id, item_name_snapshot, price_type, pack_unit, qty, cl_qty, free_qty, price_ex, price_tax_inc, tax_rate, tax_amount, value_tax_inc, vat_type, row_no"
    )
    .eq("organization_id", orgId)
    .order("row_no");

  const missingTables =
    (invoicesRes.error &&
      invoicesRes.error.message.toLowerCase().includes("does not exist")) ||
    (linesRes.error && linesRes.error.message.toLowerCase().includes("does not exist"));

  if (missingTables) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">Sales Invoice Management</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sales invoice tables are missing. Run `supabase/ADD_SALES_INVOICES.sql`, then refresh this page.
        </p>
      </div>
    );
  }

  const productsRes = await supabase
    .from("products")
    .select("id, code, name, pack_unit, stock_quantity, empties_type, bottle_cost, plastic_cost, returnable")
    .eq("organization_id", orgId)
    .order("name");

  const customersRes = await supabase
    .from("customers")
    .select("id, tax_id, name, payment_terms, sales_rep_id, price_type")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");

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

  const priceTypesRes = await supabase
    .from("price_types")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("code");

  const priceListsRes = await supabase
    .from("price_lists")
    .select("id, price_type_id, effective_date, expiry_date, is_active, price_types(name)")
    .eq("organization_id", orgId)
    .eq("is_active", true);

  const priceListItemsRes = await supabase
    .from("price_list_items")
    .select("price_list_id, product_id, price, tax_rate, vat_type")
    .eq("organization_id", orgId);

  const promotionsRes = await supabase
    .from("promotions")
    .select(
      "id, promo_code, name, promo_budget_cartons, consumed_cartons, start_date, end_date, is_active, eligible_price_types, eligible_location_ids, days_of_week, happy_hour_start, happy_hour_end"
    )
    .eq("organization_id", orgId)
    .eq("is_active", true);

  const promotionRulesRes = await supabase
    .from("promotion_rules")
    .select("promotion_id, buy_product_id, buy_qty, buy_unit, reward_product_id, reward_qty, reward_unit, row_no")
    .eq("organization_id", orgId)
    .order("row_no");

  const invoices = invoicesRes.error ? [] : invoicesRes.data ?? [];
  const lines = linesRes.error ? [] : linesRes.data ?? [];
  const products = productsRes.error ? [] : productsRes.data ?? [];
  const customers = customersRes.error ? [] : customersRes.data ?? [];
  const salesReps = repsRes.error ? [] : repsRes.data ?? [];
  const locations = locationsRes.error ? [] : locationsRes.data ?? [];
  const priceTypes = priceTypesRes.error ? [] : priceTypesRes.data ?? [];
  const priceLists = priceListsRes.error ? [] : priceListsRes.data ?? [];
  const priceListItems = priceListItemsRes.error ? [] : priceListItemsRes.data ?? [];
  const promotions = promotionsRes.error ? [] : promotionsRes.data ?? [];
  const promotionRules = promotionRulesRes.error ? [] : promotionRulesRes.data ?? [];

  return (
    <SalesInvoiceList
      invoices={invoices as Parameters<typeof SalesInvoiceList>[0]["invoices"]}
      lines={lines as Parameters<typeof SalesInvoiceList>[0]["lines"]}
      products={products as Parameters<typeof SalesInvoiceList>[0]["products"]}
      customers={customers as Parameters<typeof SalesInvoiceList>[0]["customers"]}
      salesReps={salesReps as Parameters<typeof SalesInvoiceList>[0]["salesReps"]}
      locations={locations as Parameters<typeof SalesInvoiceList>[0]["locations"]}
      priceTypes={priceTypes as Parameters<typeof SalesInvoiceList>[0]["priceTypes"]}
      priceLists={priceLists as Parameters<typeof SalesInvoiceList>[0]["priceLists"]}
      priceListItems={priceListItems as Parameters<typeof SalesInvoiceList>[0]["priceListItems"]}
      promotions={promotions as Parameters<typeof SalesInvoiceList>[0]["promotions"]}
      promotionRules={promotionRules as Parameters<typeof SalesInvoiceList>[0]["promotionRules"]}
      editId={editId}
    />
  );
}
