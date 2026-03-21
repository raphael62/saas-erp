"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { LocationTypeSearchDialog } from "@/components/settings/location-type-search-dialog";
import {
  addLocation,
  updateLocation,
} from "@/app/dashboard/settings/location-management/actions";

const labelClass = "mb-0.5 block text-xs font-medium";
const inputClass = "h-8 w-full rounded border border-input bg-background px-2.5 text-sm";

type Manager = {
  id: string;
  code: string | null;
  name: string;
  is_active?: boolean;
};

type LocationType = {
  id: string;
  code: string | null;
  name: string;
  is_active?: boolean;
};

type InitialLocation = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  location_type: string | null;
  location_manager_id: string | null;
  is_active: boolean;
  enable_inventory_management: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  managers?: Manager[];
  locationTypes?: LocationType[];
  initialLocation?: InitialLocation | null;
};

export function LocationFormDialog({
  open,
  onOpenChange,
  onSaved,
  managers = [],
  locationTypes = [],
  initialLocation = null,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enableInventory, setEnableInventory] = useState(false);
  const [locationTypeText, setLocationTypeText] = useState("");
  const [showTypeSearch, setShowTypeSearch] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const locationTypeRef = useRef<HTMLDivElement>(null);

  const activeManagers = useMemo(
    () => managers.filter((m) => m.is_active !== false),
    [managers]
  );
  const activeTypes = useMemo(
    () => locationTypes.filter((t) => t.is_active !== false),
    [locationTypes]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setEnableInventory(initialLocation?.enable_inventory_management ?? false);
    setLocationTypeText(initialLocation?.location_type ?? "");
    setShowTypeDropdown(false);
  }, [open, initialLocation]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (locationTypeRef.current && !locationTypeRef.current.contains(target)) {
        setShowTypeDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredInlineTypes = useMemo(() => {
    const q = locationTypeText.trim().toLowerCase();
    if (!q) return activeTypes;
    return activeTypes.filter((t) => {
      const code = (t.code ?? "").toLowerCase();
      const name = t.name.toLowerCase();
      return code.includes(q) || name.includes(q);
    });
  }, [activeTypes, locationTypeText]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("enable_inventory_management", enableInventory ? "true" : "false");
    formData.set("location_type", locationTypeText);

    const result = initialLocation?.id
      ? await updateLocation(initialLocation.id, formData)
      : await addLocation(formData);

    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialLocation ? "Edit Location" : "New Location"}
      contentClassName="max-w-3xl text-sm"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>
              Location Code *
            </label>
            <input
              name="code"
              required
              placeholder="e.g. MKT001"
              className={inputClass}
              defaultValue={initialLocation?.code ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>
              Location Name *
            </label>
            <input
              name="name"
              required
              placeholder="Enter location name"
              className={inputClass}
              defaultValue={initialLocation?.name ?? ""}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} style={{ color: "var(--navbar)" }}>
              Address
            </label>
            <input
              name="address"
              placeholder="Enter location address"
              className={inputClass}
              defaultValue={initialLocation?.address ?? ""}
            />
          </div>

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>
              Phone
            </label>
            <input
              name="phone"
              placeholder="e.g. +233 24 123 4567"
              className={inputClass}
              defaultValue={initialLocation?.phone ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>
              Location Type
            </label>
            <div className="relative flex gap-1" ref={locationTypeRef}>
              <input
                value={locationTypeText}
                onChange={(e) => {
                  setLocationTypeText(e.target.value);
                  setShowTypeDropdown(true);
                }}
                onFocus={() => setShowTypeDropdown(true)}
                placeholder="Select Location Type"
                className={inputClass}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowTypeSearch(true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-input bg-muted/50 hover:bg-muted"
                aria-label="Search location type"
              >
                <Search className="h-4 w-4" style={{ color: "var(--navbar)" }} />
              </button>
              {showTypeDropdown && filteredInlineTypes.length > 0 && (
                <div className="absolute left-0 right-9 top-full z-50 mt-1 max-h-48 overflow-auto rounded border border-border bg-background shadow-lg">
                  {filteredInlineTypes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full px-2.5 py-2 text-left text-sm hover:bg-muted/80"
                      onClick={() => {
                        setLocationTypeText(item.name);
                        setShowTypeDropdown(false);
                      }}
                    >
                      <span className="text-muted-foreground">{item.code ?? "—"}</span>
                      {" — "}
                      <span className="font-medium">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>
              Location Manager
            </label>
            <select
              name="location_manager_id"
              className={inputClass}
              defaultValue={initialLocation?.location_manager_id ?? ""}
            >
              <option value="">Select Manager</option>
              {activeManagers.map((m) => (
                <option key={m.id} value={m.id}>
                  {(m.code ? `${m.code} - ` : "") + m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--navbar)" }}>
              Status
            </label>
            <select
              name="is_active"
              className={inputClass}
              defaultValue={initialLocation?.is_active === false ? "false" : "true"}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} style={{ color: "var(--navbar)" }}>
              Enable Inventory Management
            </label>
            <div className="inline-grid grid-cols-2 gap-1 rounded border border-border p-1">
              <button
                type="button"
                className={`h-7 rounded px-4 text-xs ${
                  enableInventory
                    ? "bg-[var(--navbar)] text-white"
                    : "bg-background text-foreground"
                }`}
                onClick={() => setEnableInventory(true)}
              >
                Yes
              </button>
              <button
                type="button"
                className={`h-7 rounded px-4 text-xs ${
                  !enableInventory
                    ? "bg-[var(--navbar)] text-white"
                    : "bg-background text-foreground"
                }`}
                onClick={() => setEnableInventory(false)}
              >
                No
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={pending}
            style={{ backgroundColor: "var(--navbar)" }}
            className="text-white hover:opacity-90"
          >
            <Save className="h-4 w-4" />
            {pending ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>

      <LocationTypeSearchDialog
        open={showTypeSearch}
        onOpenChange={setShowTypeSearch}
        locationTypes={activeTypes}
        onSelect={(item) => setLocationTypeText(item.name)}
        onItemAdded={() => router.refresh()}
      />
    </Dialog>
  );
}
