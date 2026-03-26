import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";
import { LocationTransfers } from "@/components/inventory/location-transfers";

export default async function LocationTransfersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const [transfersRes, locationsRes, linesRes, productsRes] = await Promise.all([
    supabase
      .from("location_transfers")
      .select(
        "id, transfer_no, transfer_date, request_date, status, from_location_id, to_location_id, notes, from_location:locations!from_location_id(id, code, name), to_location:locations!to_location_id(id, code, name)"
      )
      .eq("organization_id", orgId)
      .order("transfer_date", { ascending: false })
      .order("transfer_no", { ascending: false }),
    supabase
      .from("locations")
      .select("id, code, name")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("location_transfer_lines")
      .select("id, location_transfer_id, product_id, cartons, bottles, ctn_qty, notes, row_no, product:products!product_id(id, code, name, pack_unit)")
      .eq("organization_id", orgId)
      .order("row_no"),
    supabase
      .from("products")
      .select("id, code, name, stock_quantity, unit, pack_unit")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("code"),
  ]);

  const tableMissing = Boolean(
    transfersRes.error &&
      (transfersRes.error.message.toLowerCase().includes("does not exist") ||
        transfersRes.error.message.toLowerCase().includes("schema cache"))
  );

  const lineRows = tableMissing ? [] : (linesRes.data ?? []);
  const transfers = tableMissing ? [] : (transfersRes.data ?? []);
  const locations = locationsRes.error ? [] : (locationsRes.data ?? []);
  const products = productsRes.error ? [] : (productsRes.data ?? []);
  const linesByTransfer = new Map<string, unknown[]>();
  for (const l of lineRows as Array<{ location_transfer_id?: string }>) {
    const key = String(l.location_transfer_id ?? "");
    if (!key) continue;
    const arr = linesByTransfer.get(key) ?? [];
    arr.push(l as unknown);
    linesByTransfer.set(key, arr);
  }

  const normalizedTransfers = transfers.map((t: unknown) => {
    const row = t as {
      from_location?: unknown;
      to_location?: unknown;
      [key: string]: unknown;
    };
    const from = Array.isArray(row.from_location) ? row.from_location[0] : row.from_location;
    const to = Array.isArray(row.to_location) ? row.to_location[0] : row.to_location;
    const { from_location, to_location, ...rest } = row;
    return {
      ...rest,
      from_location: from,
      to_location: to,
      lines: linesByTransfer.get(String(row.id ?? "")) ?? [],
    };
  });

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">
          Dashboard
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/dashboard/inventory" className="hover:text-foreground">
          Inventory
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Location Transfers</span>
      </nav>

      <LocationTransfers
        transfers={normalizedTransfers as Parameters<typeof LocationTransfers>[0]["transfers"]}
        locations={locations as Parameters<typeof LocationTransfers>[0]["locations"]}
        products={products as Parameters<typeof LocationTransfers>[0]["products"]}
        tableMissing={tableMissing}
      />
    </div>
  );
}
