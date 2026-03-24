import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptiesDispatchList } from "@/components/purchases/empties-dispatch-list";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

export default async function EmptiesDispatchPage({
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

  const dispatchesRes = await supabase
    .from("empties_dispatches")
    .select(
      "id, dispatch_no, supplier_id, location_id, dispatch_date, credit_note_date, dispatch_note_no, credit_note_no, po_number, delivery_note, notes, total_qty, total_value, created_at, suppliers(id, name), locations(id, code, name)"
    )
    .eq("organization_id", orgId)
    .order("dispatch_date", { ascending: false });

  const linesRes = await supabase
    .from("empties_dispatch_lines")
    .select(
      "id, empties_dispatch_id, product_id, product_code_snapshot, product_name_snapshot, empties_type, qty, unit_price, total_value, row_no"
    )
    .eq("organization_id", orgId)
    .order("row_no");

  const missingTables =
    (dispatchesRes.error && dispatchesRes.error.message.toLowerCase().includes("does not exist")) ||
    (linesRes.error && linesRes.error.message.toLowerCase().includes("does not exist"));

  if (missingTables) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">Empties Dispatch</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Empties dispatch tables are missing. Run `supabase/ADD_EMPTIES_DISPATCH.sql`, then refresh this page.
        </p>
      </div>
    );
  }

  const suppliersRes = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");

  const locationsRes = await supabase
    .from("locations")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("code");

  const productsRes = await supabase
    .from("products")
    .select("id, code, name, empties_type, bottle_cost, plastic_cost, returnable")
    .eq("organization_id", orgId)
    .ilike("name", "%empties%")
    .order("name");

  const priceListsRes = await supabase
    .from("price_lists")
    .select("id, effective_date, expiry_date, is_active, price_type_id, price_types(id, code, name)")
    .eq("organization_id", orgId);

  const priceListItemsRes = await supabase
    .from("price_list_items")
    .select("price_list_id, product_id, price, tax_rate")
    .eq("organization_id", orgId);

  const dispatches = dispatchesRes.error ? [] : dispatchesRes.data ?? [];
  const lines = linesRes.error ? [] : linesRes.data ?? [];
  const suppliers = suppliersRes.error ? [] : suppliersRes.data ?? [];
  const locations = locationsRes.error ? [] : locationsRes.data ?? [];
  const products = productsRes.error ? [] : productsRes.data ?? [];
  const priceLists = priceListsRes.error ? [] : priceListsRes.data ?? [];
  const priceListItems = priceListItemsRes.error ? [] : priceListItemsRes.data ?? [];

  return (
    <div>
      <EmptiesDispatchList
        dispatches={dispatches as unknown as Parameters<typeof EmptiesDispatchList>[0]["dispatches"]}
        lines={lines as Parameters<typeof EmptiesDispatchList>[0]["lines"]}
        suppliers={suppliers as Parameters<typeof EmptiesDispatchList>[0]["suppliers"]}
        locations={locations as Parameters<typeof EmptiesDispatchList>[0]["locations"]}
        products={products as Parameters<typeof EmptiesDispatchList>[0]["products"]}
        priceLists={priceLists as Parameters<typeof EmptiesDispatchList>[0]["priceLists"]}
        priceListItems={priceListItems as Parameters<typeof EmptiesDispatchList>[0]["priceListItems"]}
        editId={editId}
      />
    </div>
  );
}
