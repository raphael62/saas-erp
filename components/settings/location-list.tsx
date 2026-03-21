"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocationFormDialog } from "@/components/settings/location-form-dialog";
import { deleteLocation } from "@/app/dashboard/settings/location-management/actions";

type LocationRow = {
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

type SortCol =
  | "code"
  | "name"
  | "address"
  | "phone"
  | "location_type"
  | "manager"
  | "inventory"
  | "status";

export function LocationList({
  locations,
  managers = [],
  locationTypes = [],
}: {
  locations: LocationRow[];
  managers?: Manager[];
  locationTypes?: LocationType[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [includeDeactivated, setIncludeDeactivated] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [message, setMessage] = useState<string | null>(null);

  const managerById = useMemo(
    () =>
      managers.reduce<Record<string, string>>((acc, m) => {
        acc[m.id] = (m.code ? `${m.code} - ` : "") + m.name;
        return acc;
      }, {}),
    [managers]
  );

  const filtered = useMemo(() => {
    let rows = locations;
    if (!includeDeactivated) {
      rows = rows.filter((r) => r.is_active !== false);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => {
        const managerName = r.location_manager_id
          ? managerById[r.location_manager_id] ?? ""
          : "";
        return (
          r.code.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          (r.address ?? "").toLowerCase().includes(q) ||
          (r.phone ?? "").toLowerCase().includes(q) ||
          (r.location_type ?? "").toLowerCase().includes(q) ||
          managerName.toLowerCase().includes(q)
        );
      });
    }

    return [...rows].sort((a, b) => {
      const av =
        sortCol === "code"
          ? a.code
          : sortCol === "name"
            ? a.name
            : sortCol === "address"
              ? a.address ?? ""
              : sortCol === "phone"
                ? a.phone ?? ""
                : sortCol === "location_type"
                  ? a.location_type ?? ""
                  : sortCol === "manager"
                    ? (a.location_manager_id ? managerById[a.location_manager_id] : "") ?? ""
                    : sortCol === "inventory"
                      ? String(a.enable_inventory_management)
                      : String(a.is_active);
      const bv =
        sortCol === "code"
          ? b.code
          : sortCol === "name"
            ? b.name
            : sortCol === "address"
              ? b.address ?? ""
              : sortCol === "phone"
                ? b.phone ?? ""
                : sortCol === "location_type"
                  ? b.location_type ?? ""
                  : sortCol === "manager"
                    ? (b.location_manager_id ? managerById[b.location_manager_id] : "") ?? ""
                    : sortCol === "inventory"
                      ? String(b.enable_inventory_management)
                      : String(b.is_active);
      const cmp = String(av).localeCompare(String(bv), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [locations, includeDeactivated, search, sortCol, sortDir, managerById]);

  const PAGE_SIZE = 25;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selected = filtered.find((r) => r.id === selectedId) ?? null;
  const editing = filtered.find((r) => r.id === editingId) ?? null;

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortCol(col);
    setSortDir("asc");
  }

  async function handleDelete() {
    if (!selected) return;
    if (!confirm("Delete this location?")) return;
    const result = await deleteLocation(selected.id);
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    setMessage("Location deleted successfully.");
    setSelectedId(null);
    router.refresh();
  }

  const SortIcon = ({ active }: { active: boolean }) =>
    active ? (
      sortDir === "asc" ? (
        <ChevronUp className="h-3 w-3 inline" style={{ color: "var(--navbar)" }} />
      ) : (
        <ChevronDown className="h-3 w-3 inline" style={{ color: "var(--navbar)" }} />
      )
    ) : (
      <ChevronDown
        className="h-3 w-3 inline opacity-50"
        style={{ color: "var(--navbar)" }}
      />
    );

  return (
    <div className="flex min-h-[420px] flex-col space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeDeactivated}
            onChange={(e) => {
              setIncludeDeactivated(e.target.checked);
              setPage(1);
            }}
            className="h-3.5 w-3.5 rounded"
          />
          <span style={{ color: "var(--navbar)" }}>Include Deactivated</span>
        </label>
        <input
          type="text"
          placeholder="Search (F3)"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="h-8 w-56 rounded border border-input bg-background px-2.5 text-sm"
        />
        <Button
          size="sm"
          className="text-white"
          style={{ backgroundColor: "var(--navbar)" }}
          onClick={() => setPage(1)}
        >
          Search (F3)
        </Button>
      </div>

      {message && (
        <p className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
          {message}
        </p>
      )}

      <div className="max-h-[calc(100vh-20rem)] overflow-auto rounded border border-border">
        {filtered.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            No locations found. Add one using New (F2).
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 15%, white)" }}>
                <th className="border-b border-r border-border px-2 py-2 text-left font-medium">#</th>
                <th className="border-b border-r border-border px-2 py-2 text-left font-medium">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("code")}>
                    Location Code <SortIcon active={sortCol === "code"} />
                  </button>
                </th>
                <th className="border-b border-r border-border px-2 py-2 text-left font-medium">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("name")}>
                    Location Name <SortIcon active={sortCol === "name"} />
                  </button>
                </th>
                <th className="border-b border-r border-border px-2 py-2 text-left font-medium">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("address")}>
                    Address <SortIcon active={sortCol === "address"} />
                  </button>
                </th>
                <th className="border-b border-r border-border px-2 py-2 text-left font-medium">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("phone")}>
                    Phone <SortIcon active={sortCol === "phone"} />
                  </button>
                </th>
                <th className="border-b border-r border-border px-2 py-2 text-left font-medium">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("location_type")}>
                    Location Type <SortIcon active={sortCol === "location_type"} />
                  </button>
                </th>
                <th className="border-b border-r border-border px-2 py-2 text-left font-medium">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("manager")}>
                    Manager <SortIcon active={sortCol === "manager"} />
                  </button>
                </th>
                <th className="border-b border-r border-border px-2 py-2 text-left font-medium">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("inventory")}>
                    Inv. Enabled <SortIcon active={sortCol === "inventory"} />
                  </button>
                </th>
                <th className="border-b border-border px-2 py-2 text-left font-medium">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("status")}>
                    Status <SortIcon active={sortCol === "status"} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((row, i) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-b border-border last:border-0 ${
                    selectedId === row.id
                      ? "bg-muted/60"
                      : i % 2 === 0
                        ? "bg-background hover:bg-muted/20"
                        : "bg-muted/30 hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedId(row.id)}
                  onDoubleClick={() => {
                    setEditingId(row.id);
                    setShowForm(true);
                  }}
                >
                  <td className="border-r border-border px-2 py-1.5 text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td className="border-r border-border px-2 py-1.5">
                    <button
                      type="button"
                      className="text-left text-[var(--navbar)] hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(row.id);
                        setEditingId(row.id);
                        setShowForm(true);
                      }}
                    >
                      {row.code}
                    </button>
                  </td>
                  <td className="border-r border-border px-2 py-1.5">
                    <button
                      type="button"
                      className="text-left text-[var(--navbar)] hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(row.id);
                        setEditingId(row.id);
                        setShowForm(true);
                      }}
                    >
                      {row.name}
                    </button>
                  </td>
                  <td className="border-r border-border px-2 py-1.5">{row.address ?? "—"}</td>
                  <td className="border-r border-border px-2 py-1.5">{row.phone ?? "—"}</td>
                  <td className="border-r border-border px-2 py-1.5">{row.location_type ?? "—"}</td>
                  <td className="border-r border-border px-2 py-1.5">
                    {row.location_manager_id ? managerById[row.location_manager_id] ?? "—" : "—"}
                  </td>
                  <td className="border-r border-border px-2 py-1.5">
                    {row.enable_inventory_management ? "Yes" : "No"}
                  </td>
                  <td className="px-2 py-1.5">{row.is_active ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {filtered.length === 0
            ? "0 results"
            : `${(page - 1) * PAGE_SIZE + 1}-${(page - 1) * PAGE_SIZE + paginated.length} of ${filtered.length}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <span>
            Page {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingId(null);
            setShowForm(true);
          }}
          style={{ color: "var(--navbar)", borderColor: "var(--navbar)" }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New (F2)
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            setEditingId(selected.id);
            setShowForm(true);
          }}
        >
          Change
        </Button>
        <Button variant="outline" size="sm" disabled={!selected} onClick={handleDelete}>
          Delete
        </Button>
      </div>

      <LocationFormDialog
        key={editing?.id ?? "new-location"}
        open={showForm}
        onOpenChange={(next) => {
          setShowForm(next);
          if (!next) setEditingId(null);
        }}
        onSaved={() => router.refresh()}
        managers={managers}
        locationTypes={locationTypes}
        initialLocation={editing ?? null}
      />
    </div>
  );
}
