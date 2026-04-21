import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";
import { isTableUnavailableError } from "@/lib/supabase/table-missing";
import { getUserTransactionScope, filterLocationsByScope } from "@/lib/user-transaction-scope";
import { EmptiesDispatchPopupClient } from "@/components/popup/empties-dispatch-popup-client";

export default async function EmptiesDispatchPopupPage({
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

  const [dispatchRes, linesRes, suppliersRes, locationsRes, productsRes, priceListsRes, priceListItemsRes] =
    await Promise.all([
      supabase
        .from("empties_dispatches")
        .select(
          "id, dispatch_no, supplier_id, location_id, dispatch_date, credit_note_date, dispatch_note_no, credit_note_no, po_number, delivery_note, notes, total_qty, total_value, created_at, suppliers(id, name), locations(id, code, name)"
        )
        .eq("organization_id", orgId)
        .eq("id", id)
        .single(),
      supabase
        .from("empties_dispatch_lines")
        .select(
          "id, empties_dispatch_id, product_id, product_code_snapshot, product_name_snapshot, empties_type, qty, unit_price, total_value, row_no"
        )
        .eq("organization_id", orgId)
        .eq("empties_dispatch_id", id)
        .order("row_no"),
      supabase.from("suppliers").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("name"),
      supabase.from("locations").select("id, code, name").eq("organization_id", orgId).eq("is_active", true).order("code"),
      supabase.from("products").select("id, code, name, empties_type, bottle_cost, plastic_cost, returnable").eq("organization_id", orgId).ilike("name", "%empties%").order("name"),
      supabase.from("price_lists").select("id, effective_date, expiry_date, is_active, price_type_id, price_types(id, code, name)").eq("organization_id", orgId),
      supabase.from("price_list_items").select("price_list_id, product_id, price, tax_rate").eq("organization_id", orgId),
    ]);

  const missing = dispatchRes.error && isTableUnavailableError(dispatchRes.error);

  if (!missing && (dispatchRes.error || !dispatchRes.data)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Empties dispatch not found or access denied.
      </div>
    );
  }

  const scope = await getUserTransactionScope(supabase, user.id, orgId);
  const locsRaw = (locationsRes.data ?? []) as Array<{ id: string; code?: string | null; name: string }>;

  return (
    <EmptiesDispatchPopupClient
      initialDispatch={dispatchRes.data as unknown as Parameters<typeof EmptiesDispatchPopupClient>[0]["initialDispatch"]}
      initialLines={(linesRes.data ?? []) as Parameters<typeof EmptiesDispatchPopupClient>[0]["initialLines"]}
      suppliers={(suppliersRes.data ?? []) as Parameters<typeof EmptiesDispatchPopupClient>[0]["suppliers"]}
      locations={filterLocationsByScope(scope, locsRaw) as Parameters<typeof EmptiesDispatchPopupClient>[0]["locations"]}
      products={(productsRes.data ?? []) as Parameters<typeof EmptiesDispatchPopupClient>[0]["products"]}
      priceLists={(priceListsRes.data ?? []) as unknown as Parameters<typeof EmptiesDispatchPopupClient>[0]["priceLists"]}
      priceListItems={(priceListItemsRes.data ?? []) as Parameters<typeof EmptiesDispatchPopupClient>[0]["priceListItems"]}
    />
  );
}
