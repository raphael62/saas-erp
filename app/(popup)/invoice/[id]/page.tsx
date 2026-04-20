import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";
import {
  getUserTransactionScope,
  filterLocationsByScope,
  filterSalesRepsByScope,
} from "@/lib/user-transaction-scope";
import { InvoicePopupClient } from "@/components/popup/invoice-popup-client";

export default async function InvoicePopupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const [
    invoiceRes,
    linesRes,
    productsRes,
    customersRes,
    repsRes,
    locationsRes,
    priceTypesRes,
    priceListsRes,
    priceListItemsRes,
  ] = await Promise.all([
    supabase
      .from("sales_invoices")
      .select(
        "id, invoice_no, customer_id, sales_rep_id, location_id, invoice_date, delivery_date, vat_invoice_no, driver_name, vehicle_no, payment_terms, type_status, notes, balance_os, total_qty, sub_total, tax_total, grand_total, posted_at, posted_by, created_at, customers(id, name), sales_reps(id, name), locations(id, code, name)"
      )
      .eq("organization_id", orgId)
      .eq("id", id)
      .single(),
    supabase
      .from("sales_invoice_lines")
      .select(
        "id, sales_invoice_id, product_id, item_name_snapshot, price_type, pack_unit, qty, cl_qty, free_qty, price_ex, price_tax_inc, tax_rate, tax_amount, value_tax_inc, vat_type, row_no"
      )
      .eq("organization_id", orgId)
      .eq("sales_invoice_id", id)
      .order("row_no"),
    supabase
      .from("products")
      .select("id, code, name, pack_unit, stock_quantity, empties_type, bottle_cost, plastic_cost, returnable")
      .eq("organization_id", orgId)
      .order("name"),
    supabase
      .from("customers")
      .select("id, tax_id, name, payment_terms, sales_rep_id, price_type")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("sales_reps").select("id, code, name").eq("organization_id", orgId).eq("is_active", true).order("name"),
    supabase.from("locations").select("id, code, name").eq("organization_id", orgId).eq("is_active", true).order("code"),
    supabase.from("price_types").select("id, code, name").eq("organization_id", orgId).eq("is_active", true).order("code"),
    supabase
      .from("price_lists")
      .select("id, price_type_id, effective_date, expiry_date, is_active, price_types(name)")
      .eq("organization_id", orgId)
      .eq("is_active", true),
    supabase.from("price_list_items").select("price_list_id, product_id, price, tax_rate, vat_type").eq("organization_id", orgId),
  ]);

  if (invoiceRes.error || !invoiceRes.data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Invoice not found or access denied.
      </div>
    );
  }

  const scope = await getUserTransactionScope(supabase, user.id, orgId);

  return (
    <InvoicePopupClient
      organizationId={orgId}
      invoice={invoiceRes.data as Parameters<typeof InvoicePopupClient>[0]["invoice"]}
      lines={(linesRes.data ?? []) as Parameters<typeof InvoicePopupClient>[0]["lines"]}
      products={(productsRes.data ?? []) as Parameters<typeof InvoicePopupClient>[0]["products"]}
      customers={(customersRes.data ?? []) as Parameters<typeof InvoicePopupClient>[0]["customers"]}
      salesReps={filterSalesRepsByScope(scope, (repsRes.data ?? []) as Array<{ id: string; code?: string | null; name: string }>) as Parameters<typeof InvoicePopupClient>[0]["salesReps"]}
      locations={filterLocationsByScope(scope, (locationsRes.data ?? []) as Array<{ id: string; code?: string | null; name: string }>) as Parameters<typeof InvoicePopupClient>[0]["locations"]}
      priceTypes={(priceTypesRes.data ?? []) as Parameters<typeof InvoicePopupClient>[0]["priceTypes"]}
      priceLists={(priceListsRes.data ?? []) as Parameters<typeof InvoicePopupClient>[0]["priceLists"]}
      priceListItems={(priceListItemsRes.data ?? []) as Parameters<typeof InvoicePopupClient>[0]["priceListItems"]}
    />
  );
}
