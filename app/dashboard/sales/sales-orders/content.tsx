import { createClient } from "@/lib/supabase/server";
import { SalesOrderList } from "@/components/sales/sales-order-list";

export async function SalesOrdersContent({
  orgId,
  skipQueries,
  editId,
}: {
  orgId: string;
  skipQueries?: boolean;
  editId?: string;
}) {
  let orders: unknown[] = [];
  let lines: unknown[] = [];
  let products: unknown[] = [];
  let customers: unknown[] = [];
  let salesReps: unknown[] = [];
  let locations: unknown[] = [];
  let priceTypes: unknown[] = [];
  let priceLists: unknown[] = [];
  let priceListItems: unknown[] = [];
  let invoices: unknown[] = [];

  if (!skipQueries) {
    const supabase = await createClient();
    const [
      ordersRes,
      linesRes,
      productsRes,
      customersRes,
      repsRes,
      locationsRes,
      priceTypesRes,
      priceListsRes,
      priceListItemsRes,
      invoicesRes,
    ] = await Promise.all([
      supabase
        .from("sales_orders")
        .select(
          "id, order_no, customer_id, sales_rep_id, location_id, order_date, delivery_date, notes, sub_total, tax_total, grand_total, created_at, customers(id, name), sales_reps(id, name), locations(id, code, name)"
        )
        .eq("organization_id", orgId)
        .order("order_date", { ascending: false }),
      supabase
        .from("sales_order_lines")
        .select(
          "id, sales_order_id, product_id, item_name_snapshot, price_type, pack_unit, qty, cl_qty, price_ex, price_tax_inc, tax_amount, value_tax_inc, row_no"
        )
        .eq("organization_id", orgId)
        .order("row_no"),
      supabase.from("products").select("id, code, name, pack_unit").eq("organization_id", orgId).order("name"),
      supabase
        .from("customers")
        .select("id, tax_id, name, payment_terms, sales_rep_id, price_type, location_id")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("sales_reps")
        .select("id, code, name")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("locations")
        .select("id, code, name")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("code"),
      supabase
        .from("price_types")
        .select("id, code, name")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("code"),
      supabase
        .from("price_lists")
        .select("id, price_type_id, effective_date, expiry_date, is_active, price_types(name)")
        .eq("organization_id", orgId)
        .eq("is_active", true),
      supabase
        .from("price_list_items")
        .select("price_list_id, product_id, price, tax_rate, vat_type")
        .eq("organization_id", orgId),
      supabase
        .from("sales_invoices")
        .select("customer_id, invoice_date, location_id, balance_os")
        .eq("organization_id", orgId),
    ]);

    const missingTables =
      (ordersRes.error && ordersRes.error.message.toLowerCase().includes("does not exist")) ||
      (linesRes.error && linesRes.error.message.toLowerCase().includes("does not exist"));

    if (missingTables) {
      return (
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">Sales Order Management</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sales order tables are missing. Run migration <code>023_sales_orders.sql</code> in Supabase, then refresh this page.
          </p>
        </div>
      );
    }

    orders = ordersRes.error ? [] : ordersRes.data ?? [];
    lines = linesRes.error ? [] : linesRes.data ?? [];
    products = productsRes.error ? [] : productsRes.data ?? [];
    customers = customersRes.error ? [] : customersRes.data ?? [];
    salesReps = repsRes.error ? [] : repsRes.data ?? [];
    locations = locationsRes.error ? [] : locationsRes.data ?? [];
    priceTypes = priceTypesRes.error ? [] : priceTypesRes.data ?? [];
    priceLists = priceListsRes.error ? [] : priceListsRes.data ?? [];
    priceListItems = priceListItemsRes.error ? [] : priceListItemsRes.data ?? [];
    invoices = invoicesRes.error ? [] : invoicesRes.data ?? [];
  }

  return (
    <>
      {skipQueries && (
        <div className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          Bypass mode (orders skipped). <a href="/dashboard/sales/sales-orders" className="underline">Load normally</a>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <a href="/dashboard" className="hover:text-foreground">Dashboard</a>
        <span>/</span>
        <a href="/dashboard/sales" className="hover:text-foreground">Sales</a>
        <span>/</span>
        <span className="text-foreground">Sales Orders</span>
      </div>
      <SalesOrderList
        orders={orders as Parameters<typeof SalesOrderList>[0]["orders"]}
        lines={lines as Parameters<typeof SalesOrderList>[0]["lines"]}
        products={products as Parameters<typeof SalesOrderList>[0]["products"]}
        customers={customers as Parameters<typeof SalesOrderList>[0]["customers"]}
        salesReps={salesReps as Parameters<typeof SalesOrderList>[0]["salesReps"]}
        locations={locations as Parameters<typeof SalesOrderList>[0]["locations"]}
        priceTypes={priceTypes as Parameters<typeof SalesOrderList>[0]["priceTypes"]}
        priceLists={priceLists as Parameters<typeof SalesOrderList>[0]["priceLists"]}
        priceListItems={priceListItems as Parameters<typeof SalesOrderList>[0]["priceListItems"]}
        invoices={invoices as Parameters<typeof SalesOrderList>[0]["invoices"]}
        editId={editId}
      />
    </>
  );
}
