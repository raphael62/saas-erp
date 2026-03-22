import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PurchaseInvoiceList } from "@/components/purchases/purchase-invoice-list";

export default async function PurchaseInvoicesPage({
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
    .from("purchase_invoices")
    .select(
      "id, invoice_no, supplier_id, location_id, invoice_date, delivery_date, due_date, payment_date, supplier_inv_no, empties_inv_no, pi_no, delivery_note_no, transporter, driver_name, vehicle_no, print_qty, notes, balance_os, total_qty, sub_total, tax_total, grand_total, created_at, suppliers(id, name), locations(id, code, name)"
    )
    .eq("organization_id", orgId)
    .order("invoice_date", { ascending: false });

  const linesRes = await supabase
    .from("purchase_invoice_lines")
    .select(
      "id, purchase_invoice_id, product_id, item_name_snapshot, pack_unit, btl_qty, ctn_qty, btl_gross_bill, btl_gross_value, price_ex, pre_tax, tax_amount, price_tax_inc, tax_inc_value, empties_value, row_no"
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
        <h1 className="text-lg font-semibold">Purchase Invoice Management</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Purchase invoice tables are missing. Run `supabase/ADD_PURCHASE_INVOICES.sql`, then refresh this page.
        </p>
      </div>
    );
  }

  const productsRes = await supabase
    .from("products")
    .select("id, code, name, pack_unit, stock_quantity, empties_type, bottle_cost, plastic_cost, returnable")
    .eq("organization_id", orgId)
    .order("name");

  const suppliersRes = await supabase
    .from("suppliers")
    .select("id, name, payment_terms")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");

  const locationsRes = await supabase
    .from("locations")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("code");

  const priceListsRes = await supabase
    .from("price_lists")
    .select("id, effective_date, expiry_date, is_active, price_type_id, price_types(id, code, name)")
    .eq("organization_id", orgId);

  const priceListItemsRes = await supabase
    .from("price_list_items")
    .select("price_list_id, product_id, price, tax_rate")
    .eq("organization_id", orgId);

  const invoices = invoicesRes.error ? [] : invoicesRes.data ?? [];
  const lines = linesRes.error ? [] : linesRes.data ?? [];
  const products = productsRes.error ? [] : productsRes.data ?? [];
  const suppliers = suppliersRes.error ? [] : suppliersRes.data ?? [];
  const locations = locationsRes.error ? [] : locationsRes.data ?? [];
  const priceLists = priceListsRes.error ? [] : priceListsRes.data ?? [];
  const priceListItems = priceListItemsRes.error ? [] : priceListItemsRes.data ?? [];

  return (
    <div>
      <PurchaseInvoiceList
        invoices={invoices as unknown as Parameters<typeof PurchaseInvoiceList>[0]["invoices"]}
        lines={lines as Parameters<typeof PurchaseInvoiceList>[0]["lines"]}
        products={products as Parameters<typeof PurchaseInvoiceList>[0]["products"]}
        suppliers={suppliers as Parameters<typeof PurchaseInvoiceList>[0]["suppliers"]}
        locations={locations as Parameters<typeof PurchaseInvoiceList>[0]["locations"]}
        priceLists={priceLists as Parameters<typeof PurchaseInvoiceList>[0]["priceLists"]}
        priceListItems={priceListItems as Parameters<typeof PurchaseInvoiceList>[0]["priceListItems"]}
        editId={editId}
      />
    </div>
  );
}
