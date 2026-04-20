import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";
import { isTableUnavailableError } from "@/lib/supabase/table-missing";
import { getUserTransactionScope, filterLocationsByScope } from "@/lib/user-transaction-scope";
import { EmptiesReceivePopupClient } from "@/components/popup/empties-receive-popup-client";

export default async function EmptiesReceivePopupPage({
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

  const [receiveRes, linesRes, customersRes, locationsRes, productsRes] = await Promise.all([
    supabase
      .from("empties_receives")
      .select(
        "id, receive_no, empties_receipt_no, customer_id, location_id, receive_date, notes, total_items, total_received_qty, total_os_qty, status, created_at, customers(id, name), locations(id, code, name)"
      )
      .eq("organization_id", orgId)
      .eq("id", id)
      .single(),
    supabase
      .from("empties_receive_lines")
      .select(
        "id, empties_receive_id, product_id, product_code_snapshot, product_name_snapshot, sold_qty, owed_qty, expected_qty, received_qty, os_qty, row_no"
      )
      .eq("organization_id", orgId)
      .eq("empties_receive_id", id)
      .order("row_no"),
    supabase.from("customers").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("name"),
    supabase.from("locations").select("id, code, name").eq("organization_id", orgId).eq("is_active", true).order("code"),
    supabase.from("products").select("id, code, name, empties_type, returnable").eq("organization_id", orgId).ilike("name", "%empties%").order("name"),
  ]);

  const missing = receiveRes.error && isTableUnavailableError(receiveRes.error);

  if (!missing && (receiveRes.error || !receiveRes.data)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Empties receive not found or access denied.
      </div>
    );
  }

  const scope = await getUserTransactionScope(supabase, user.id, orgId);
  const locsRaw = (locationsRes.data ?? []) as Array<{ id: string; code?: string | null; name: string }>;

  return (
    <EmptiesReceivePopupClient
      initialReceive={receiveRes.data as Parameters<typeof EmptiesReceivePopupClient>[0]["initialReceive"]}
      initialLines={(linesRes.data ?? []) as Parameters<typeof EmptiesReceivePopupClient>[0]["initialLines"]}
      customers={(customersRes.data ?? []) as Parameters<typeof EmptiesReceivePopupClient>[0]["customers"]}
      locations={filterLocationsByScope(scope, locsRaw) as Parameters<typeof EmptiesReceivePopupClient>[0]["locations"]}
      products={(productsRes.data ?? []) as Parameters<typeof EmptiesReceivePopupClient>[0]["products"]}
    />
  );
}
