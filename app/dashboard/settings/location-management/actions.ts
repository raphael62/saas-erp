"use server";

import { revalidatePath } from "next/cache";
import { gateModulePageAction } from "@/lib/mutation-gate";

export async function addLocation(formData: FormData) {
  const gate = await gateModulePageAction("settings", "location-management", "create");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId } = gate;

  const code = ((formData.get("code") as string) || "").trim();
  const name = ((formData.get("name") as string) || "").trim();
  const address = ((formData.get("address") as string) || "").trim() || null;
  const phone = ((formData.get("phone") as string) || "").trim() || null;
  const locationType = ((formData.get("location_type") as string) || "").trim() || null;
  const locationManagerId =
    ((formData.get("location_manager_id") as string) || "").trim() || null;
  const isActive = ((formData.get("is_active") as string) || "true") !== "false";
  const enableInventoryManagement =
    ((formData.get("enable_inventory_management") as string) || "false") === "true";

  if (!code) return { error: "Location code is required" };
  if (!name) return { error: "Location name is required" };

  const { error: insertError } = await supabase.from("locations").insert({
    organization_id: orgId,
    code,
    name,
    address,
    phone,
    location_type: locationType,
    location_manager_id: locationManagerId,
    is_active: isActive,
    enable_inventory_management: enableInventoryManagement,
  });

  if (insertError) return { error: insertError.message };

  revalidatePath("/dashboard/settings/location-management");
  return { ok: true };
}

export async function updateLocation(id: string, formData: FormData) {
  const gate = await gateModulePageAction("settings", "location-management", "edit");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId } = gate;

  const code = ((formData.get("code") as string) || "").trim();
  const name = ((formData.get("name") as string) || "").trim();
  const address = ((formData.get("address") as string) || "").trim() || null;
  const phone = ((formData.get("phone") as string) || "").trim() || null;
  const locationType = ((formData.get("location_type") as string) || "").trim() || null;
  const locationManagerId =
    ((formData.get("location_manager_id") as string) || "").trim() || null;
  const isActive = ((formData.get("is_active") as string) || "true") !== "false";
  const enableInventoryManagement =
    ((formData.get("enable_inventory_management") as string) || "false") === "true";

  if (!code) return { error: "Location code is required" };
  if (!name) return { error: "Location name is required" };

  const { error: updateError } = await supabase
    .from("locations")
    .update({
      code,
      name,
      address,
      phone,
      location_type: locationType,
      location_manager_id: locationManagerId,
      is_active: isActive,
      enable_inventory_management: enableInventoryManagement,
    })
    .eq("id", id)
    .eq("organization_id", orgId);

  if (updateError) return { error: updateError.message };

  revalidatePath("/dashboard/settings/location-management");
  return { ok: true };
}

export async function deleteLocation(id: string) {
  const gate = await gateModulePageAction("settings", "location-management", "delete");
  if (!gate.ok) return { error: gate.error };
  const { supabase, orgId } = gate;

  const { error: deleteError } = await supabase
    .from("locations")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (deleteError) return { error: deleteError.message };

  revalidatePath("/dashboard/settings/location-management");
  return { ok: true };
}
