import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LocationList } from "@/components/settings/location-list";

export default async function LocationManagementPage() {
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

  let locations: Array<{
    id: string;
    code: string;
    name: string;
    address: string | null;
    phone: string | null;
    location_type: string | null;
    location_manager_id: string | null;
    is_active: boolean;
    enable_inventory_management: boolean;
  }> = [];

  let tableError: string | null = null;

  const { data: locationData, error: locationError } = await supabase
    .from("locations")
    .select(
      "id, code, name, address, phone, location_type, location_manager_id, is_active, enable_inventory_management"
    )
    .eq("organization_id", orgId)
    .order("code");

  if (locationError) {
    tableError = locationError.message;
  } else {
    locations = (locationData ?? []) as typeof locations;
  }

  const { data: managersData } = await supabase
    .from("sales_reps")
    .select("id, code, name, is_active")
    .eq("organization_id", orgId)
    .order("name");

  const { data: locationTypeData } = await supabase
    .from("location_types")
    .select("id, code, name, is_active")
    .eq("organization_id", orgId)
    .order("code");

  const managers = (managersData ?? []) as Array<{
    id: string;
    code: string | null;
    name: string;
    is_active?: boolean;
  }>;

  const locationTypes = (locationTypeData ?? []) as Array<{
    id: string;
    code: string | null;
    name: string;
    is_active?: boolean;
  }>;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Location Management</h1>
      {tableError ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          <p className="font-medium">Location table is not ready yet.</p>
          <p className="mt-1">Run `supabase/ADD_LOCATIONS.sql` in Supabase SQL editor, then refresh this page.</p>
          <p className="mt-1 text-xs">{tableError}</p>
        </div>
      ) : (
        <LocationList locations={locations} managers={managers} locationTypes={locationTypes} />
      )}
    </div>
  );
}
