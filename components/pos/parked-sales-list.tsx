"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  listPosParkedCarts,
  deletePosParkedCart,
  type PosParkedCartRow,
} from "@/app/dashboard/pos/parked-actions";

const POS_PARKED_PREFIX = "pos-parked-";

const UUID_RESUME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ParkedPayload = {
  saleDate?: string;
  customerId?: string;
  locationId?: string;
  salesRepId?: string;
  notes?: string;
  lines?: Array<{
    key?: string;
    product_id: string;
    item_code: string;
    item_name: string;
    price_type: string;
    pack_unit: string;
    btl_qty: string;
    ctn_qty: string;
    price_tax_inc: string;
    tax_rate: string;
    value_tax_inc: string;
    isPromo?: boolean;
  }>;
  emptiesRcvd?: Record<string, string>;
  grandTotal?: number;
};

type ParkedItem = {
  id: string;
  receipt_no: string;
  customer_name: string;
  location_name: string;
  total: number;
  payload: ParkedPayload;
};

type Customer = { id: string; name: string };
type Location = { id: string; name: string };

function fmtMoney(value: number) {
  return `GH�� ${(Number.isFinite(value) ? value : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function mapServerRows(
  rows: PosParkedCartRow[],
  customers: Customer[],
  locations: Location[]
): ParkedItem[] {
  return rows.map((row) => {
    const p = row.payload as ParkedPayload;
    const customerName = p.customerId
      ? customers.find((c) => c.id === p.customerId)?.name ?? "—"
      : "—";
    const locationName = locations.find((l) => l.id === p.locationId)?.name ?? "—";
    const total = Number.isFinite(p.grandTotal) ? (p.grandTotal ?? 0) : 0;
    const shortId = row.id.replace(/-/g, "").slice(-6);
    const receiptNo = `PARK-${(p.saleDate ?? "").replace(/-/g, "")}-${shortId}`;
    return {
      id: row.id,
      receipt_no: receiptNo,
      customer_name: customerName,
      location_name: locationName,
      total,
      payload: p,
    };
  });
}

function loadLegacyLocal(
  customers: Customer[],
  locations: Location[]
): ParkedItem[] {
  if (typeof window === "undefined") return [];
  const result: ParkedItem[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(POS_PARKED_PREFIX)) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const payload = JSON.parse(raw) as ParkedPayload;
      const customerName = payload.customerId
        ? customers.find((c) => c.id === payload.customerId)?.name ?? "—"
        : "—";
      const locationName =
        locations.find((l) => l.id === payload.locationId)?.name ?? "—";
      const total: number = Number.isFinite(payload.grandTotal) ? (payload.grandTotal ?? 0) : 0;
      const receiptNo = `PARK-${(payload.saleDate ?? "").replace(/-/g, "")}-${key.replace(POS_PARKED_PREFIX, "").slice(-6)}`;
      result.push({
        id: key,
        receipt_no: receiptNo,
        customer_name: customerName,
        location_name: locationName,
        total,
        payload,
      });
    } catch {
      // skip invalid
    }
  }
  result.sort((a, b) => b.id.localeCompare(a.id));
  return result;
}

export function ParkedSalesList({
  orgId = "",
  customers = [],
  locations = [],
}: {
  orgId?: string;
  customers?: Customer[];
  locations?: Location[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<ParkedItem[]>([]);

  const loadParked = useCallback(async () => {
    if (orgId?.trim()) {
      const res = await listPosParkedCarts();
      if (res.error) {
        setItems(loadLegacyLocal(customers, locations));
        return;
      }
      const mapped = mapServerRows(res.carts ?? [], customers, locations);
      mapped.sort((a, b) => b.id.localeCompare(a.id));
      setItems(mapped);
      return;
    }
    setItems(loadLegacyLocal(customers, locations));
  }, [orgId, customers, locations]);

  useEffect(() => {
    void loadParked();
  }, [loadParked]);

  const handleResume = (item: ParkedItem) => {
    router.push(`/dashboard/pos/new-sale?resume=${encodeURIComponent(item.id)}`);
  };

  const handleDelete = (item: ParkedItem) => {
    if (!confirm("Delete this parked sale?")) return;
    void (async () => {
      if (UUID_RESUME.test(item.id)) {
        const r = await deletePosParkedCart(item.id);
        if (r.error) {
          alert(r.error);
          return;
        }
      } else {
        try {
          window.localStorage.removeItem(item.id);
        } catch {
          // ignore
        }
      }
      await loadParked();
    })();
  };

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-muted-foreground">No parked sales.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Park a sale from the New Sale screen to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {items.length} parked sale{items.length !== 1 ? "s" : ""}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col justify-between rounded-lg border border-border bg-card p-4"
          >
            <div>
              <p className="font-semibold">{item.receipt_no}</p>
              <p className="text-sm text-muted-foreground">
                {item.customer_name} • {item.location_name}
              </p>
              <p
                className={`mt-2 text-lg font-semibold ${item.total < 0 ? "text-destructive" : ""}`}
              >
                {fmtMoney(item.total)}
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                style={{ backgroundColor: "var(--navbar)", color: "white" }}
                className="border-transparent"
                onClick={() => handleResume(item)}
              >
                Resume
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => handleDelete(item)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
