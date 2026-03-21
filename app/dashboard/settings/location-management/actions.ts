"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getOrganizationId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Unauthorized" as const, orgId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id?: string } | null)?.organization_id ?? null;
  if (!orgId) return { supabase, error: "No organization" as const, orgId: null };

  return { supabase, error: null, orgId };
}

export async function addLocation(formData: FormData) {
  const { supabase, error, orgId } = await getOrganizationId();
  if (error || !orgId) return { error: error ?? "No organization" };

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
  const { supabase, error, orgId } = await getOrganizationId();
  if (error || !orgId) return { error: error ?? "No organization" };

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
  const { supabase, error, orgId } = await getOrganizationId();
  if (error || !orgId) return { error: error ?? "No organization" };

  const { error: deleteError } = await supabase
    .from("locations")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (deleteError) return { error: deleteError.message };

  revalidatePath("/dashboard/settings/location-management");
  return { ok: true };
}
