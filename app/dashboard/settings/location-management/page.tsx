import { createClient } from "@/lib/supabase/server";
import { LocationList } from "@/components/settings/location-list";
import { requireOrgId } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

export default async function LocationManagementPage() {
  const { orgId } = await requireOrgId();
  if (!orgId) return <NoOrgPrompt />;

  const supabase = await createClient();
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
          {tableError.toLowerCase().includes("infinite recursion") &&
          tableError.toLowerCase().includes("profiles") ? (
            <>
              <p className="font-medium text-foreground">Database security policy issue (profiles)</p>
              <p className="mt-1">
                Apply migration <code className="text-xs">038_fix_profiles_rls_recursion_helpers.sql</code> in the
                Supabase SQL Editor (or run <code className="text-xs">supabase db push</code>), then refresh.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Location table is not ready yet.</p>
              <p className="mt-1">
                Run <code className="text-xs">supabase/migrations/006_locations.sql</code> or{" "}
                <code className="text-xs">ADD_LOCATIONS.sql</code> in Supabase, then refresh.
              </p>
            </>
          )}
          <p className="mt-2 text-xs opacity-80">{tableError}</p>
        </div>
      ) : (
        <LocationList locations={locations} managers={managers} locationTypes={locationTypes} />
      )}
    </div>
  );
}
