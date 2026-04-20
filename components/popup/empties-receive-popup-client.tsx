"use client";

import { useRouter } from "next/navigation";
import { EmptiesReceiveFormDialog } from "@/components/sales/empties-receive-list";

type Props = Parameters<typeof EmptiesReceiveFormDialog>[0];

export function EmptiesReceivePopupClient({
  initialReceive,
  initialLines,
  customers,
  locations,
  products,
}: {
  initialReceive: NonNullable<Props["initialReceive"]>;
  initialLines: NonNullable<Props["initialLines"]>;
  customers: NonNullable<Props["customers"]>;
  locations: NonNullable<Props["locations"]>;
  products: NonNullable<Props["products"]>;
}) {
  const router = useRouter();
  return (
    <EmptiesReceiveFormDialog
      open
      inline
      onOpenChange={(open) => { if (!open) window.parent.postMessage({ type: "close-overlay" }, "*"); }}
      onSaved={() => router.refresh()}
      initialReceive={initialReceive}
      initialLines={initialLines}
      customers={customers}
      locations={locations}
      products={products}
    />
  );
}
