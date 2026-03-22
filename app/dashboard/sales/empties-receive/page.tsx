import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptiesReceiveList } from "@/components/sales/empties-receive-list";

export default async function EmptiesReceivePage({
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

  const receivesRes = await supabase
    .from("empties_receives")
    .select(
      "id, receive_no, empties_receipt_no, customer_id, location_id, receive_date, notes, total_items, total_received_qty, total_os_qty, status, created_at, customers(id, name), locations(id, code, name)"
    )
    .eq("organization_id", orgId)
    .order("receive_date", { ascending: false });

  const linesRes = await supabase
    .from("empties_receive_lines")
    .select(
      "id, empties_receive_id, product_id, product_code_snapshot, product_name_snapshot, sold_qty, owed_qty, expected_qty, received_qty, os_qty, row_no"
    )
    .eq("organization_id", orgId)
    .order("row_no");

  const missingTables =
    (receivesRes.error && receivesRes.error.message.toLowerCase().includes("does not exist")) ||
    (linesRes.error && linesRes.error.message.toLowerCase().includes("does not exist"));

  if (missingTables) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">Empties Receive</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Empties receive tables are missing. Run `supabase/ADD_EMPTIES_RECEIVE.sql`, then refresh this page.
        </p>
      </div>
    );
  }

  const customersRes = await supabase
    .from("customers")
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
    .select("id, code, name, empties_type, returnable")
    .eq("organization_id", orgId)
    .ilike("name", "%empties%")
    .order("name");

  const receives = receivesRes.error ? [] : receivesRes.data ?? [];
  const lines = linesRes.error ? [] : linesRes.data ?? [];
  const customers = customersRes.error ? [] : customersRes.data ?? [];
  const locations = locationsRes.error ? [] : locationsRes.data ?? [];
  const products = productsRes.error ? [] : productsRes.data ?? [];

  return (
    <EmptiesReceiveList
      receives={receives as unknown as Parameters<typeof EmptiesReceiveList>[0]["receives"]}
      lines={lines as Parameters<typeof EmptiesReceiveList>[0]["lines"]}
      customers={customers as Parameters<typeof EmptiesReceiveList>[0]["customers"]}
      locations={locations as Parameters<typeof EmptiesReceiveList>[0]["locations"]}
      products={products as Parameters<typeof EmptiesReceiveList>[0]["products"]}
      editId={editId}
    />
  );
}
