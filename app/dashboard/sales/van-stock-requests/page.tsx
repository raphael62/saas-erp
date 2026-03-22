import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { VanStockRequestList } from "@/components/sales/van-stock-request-list";

export default async function VanStockRequestsPage({
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

  const reqRes = await supabase
    .from("van_stock_requests")
    .select(
      "id, request_no, sales_rep_id, location_id, request_date, needed_for_date, request_type, status, notes, total_items, total_qty, created_at, sales_reps(id, code, name), locations(id, code, name)"
    )
    .eq("organization_id", orgId)
    .order("request_date", { ascending: false });

  const linesRes = await supabase
    .from("van_stock_request_lines")
    .select("id, van_stock_request_id, product_id, product_code_snapshot, product_name_snapshot, qty_ctn, row_no")
    .eq("organization_id", orgId)
    .order("row_no");

  const missing =
    (reqRes.error && reqRes.error.message.toLowerCase().includes("does not exist")) ||
    (linesRes.error && linesRes.error.message.toLowerCase().includes("does not exist"));

  if (missing) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">Van Stock Requests</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Run the migration <code className="rounded bg-muted px-1">supabase/migrations/013_van_stock_requests_load_out.sql</code>{" "}
          in the Supabase SQL editor, then refresh.
        </p>
      </div>
    );
  }

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

  const productsRes = await supabase
    .from("products")
    .select("id, code, name")
    .eq("organization_id", orgId)
    .order("name");

  const loadOutSheetsRes = await supabase
    .from("load_out_sheets")
    .select("id, sales_rep_id, location_id, sales_date")
    .eq("organization_id", orgId);

  const loadOutLinesRes = await supabase
    .from("load_out_sheet_lines")
    .select("load_out_sheet_id, product_id")
    .eq("organization_id", orgId);

  const requests = reqRes.error ? [] : reqRes.data ?? [];
  const lines = linesRes.error ? [] : linesRes.data ?? [];
  const reps = repsRes.error ? [] : repsRes.data ?? [];
  const locations = locationsRes.error ? [] : locationsRes.data ?? [];
  const products = productsRes.error ? [] : productsRes.data ?? [];
  const loadOutSheets = loadOutSheetsRes.error ? [] : loadOutSheetsRes.data ?? [];
  const loadOutLines = loadOutLinesRes.error ? [] : loadOutLinesRes.data ?? [];

  return (
    <div className="space-y-4">
      <nav className="text-muted-foreground text-sm">
        <Link href="/dashboard/sales" className="hover:text-foreground">
          Sales
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Van Stock Requests</span>
      </nav>
      <VanStockRequestList
        requests={requests as unknown as Parameters<typeof VanStockRequestList>[0]["requests"]}
        lines={lines as Parameters<typeof VanStockRequestList>[0]["lines"]}
        reps={reps as Parameters<typeof VanStockRequestList>[0]["reps"]}
        locations={locations as Parameters<typeof VanStockRequestList>[0]["locations"]}
        products={products as Parameters<typeof VanStockRequestList>[0]["products"]}
        loadOutSheets={loadOutSheets as Parameters<typeof VanStockRequestList>[0]["loadOutSheets"]}
        loadOutLines={loadOutLines as Parameters<typeof VanStockRequestList>[0]["loadOutLines"]}
        editId={editId}
      />
    </div>
  );
}
