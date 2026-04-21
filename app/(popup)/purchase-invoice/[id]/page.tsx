import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";
import { getUserTransactionScope, filterLocationsByScope } from "@/lib/user-transaction-scope";
import { PurchaseInvoicePopupClient } from "@/components/popup/purchase-invoice-popup-client";

export default async function PurchaseInvoicePopupPage({
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

  const [invoiceRes, linesRes, productsRes, suppliersRes, locationsRes, priceListsRes, priceListItemsRes] =
    await Promise.all([
      supabase
        .from("purchase_invoices")
        .select(
          "id, invoice_no, supplier_id, location_id, invoice_date, delivery_date, due_date, payment_date, supplier_inv_no, empties_inv_no, pi_no, delivery_note_no, transporter, driver_name, vehicle_no, print_qty, notes, balance_os, total_qty, sub_total, tax_total, grand_total, created_at, suppliers(id, name), locations(id, code, name)"
        )
        .eq("organization_id", orgId)
        .eq("id", id)
        .single(),
      supabase
        .from("purchase_invoice_lines")
        .select(
          "id, purchase_invoice_id, product_id, item_name_snapshot, pack_unit, btl_qty, ctn_qty, btl_gross_bill, btl_gross_value, price_ex, pre_tax, tax_amount, price_tax_inc, tax_inc_value, empties_value, row_no"
        )
        .eq("organization_id", orgId)
        .eq("purchase_invoice_id", id)
        .order("row_no"),
      supabase
        .from("products")
        .select("id, code, name, pack_unit, stock_quantity, empties_type, bottle_cost, plastic_cost, returnable")
        .eq("organization_id", orgId)
        .order("name"),
      supabase.from("suppliers").select("id, name, payment_terms").eq("organization_id", orgId).eq("is_active", true).order("name"),
      supabase.from("locations").select("id, code, name").eq("organization_id", orgId).eq("is_active", true).order("code"),
      supabase.from("price_lists").select("id, effective_date, expiry_date, is_active, price_type_id, price_types(id, code, name)").eq("organization_id", orgId),
      supabase.from("price_list_items").select("price_list_id, product_id, price, tax_rate").eq("organization_id", orgId),
    ]);

  if (invoiceRes.error || !invoiceRes.data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Purchase invoice not found or access denied.
      </div>
    );
  }

  const scope = await getUserTransactionScope(supabase, user.id, orgId);
  const locsRaw = (locationsRes.data ?? []) as Array<{ id: string; code?: string | null; name: string }>;

  return (
    <PurchaseInvoicePopupClient
      organizationId={orgId}
      initialInvoice={invoiceRes.data as unknown as Parameters<typeof PurchaseInvoicePopupClient>[0]["initialInvoice"]}
      initialLines={(linesRes.data ?? []) as Parameters<typeof PurchaseInvoicePopupClient>[0]["initialLines"]}
      products={(productsRes.data ?? []) as Parameters<typeof PurchaseInvoicePopupClient>[0]["products"]}
      suppliers={(suppliersRes.data ?? []) as Parameters<typeof PurchaseInvoicePopupClient>[0]["suppliers"]}
      locations={filterLocationsByScope(scope, locsRaw) as Parameters<typeof PurchaseInvoicePopupClient>[0]["locations"]}
      priceLists={(priceListsRes.data ?? []) as unknown as Parameters<typeof PurchaseInvoicePopupClient>[0]["priceLists"]}
      priceListItems={(priceListItemsRes.data ?? []) as Parameters<typeof PurchaseInvoicePopupClient>[0]["priceListItems"]}
    />
  );
}
