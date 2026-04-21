"use client";

import { useRouter } from "next/navigation";
import { EmptiesDispatchFormDialog } from "@/components/purchases/empties-dispatch-list";

type Props = Parameters<typeof EmptiesDispatchFormDialog>[0];

export function EmptiesDispatchPopupClient({
  initialDispatch,
  initialLines,
  suppliers,
  locations,
  products,
  priceLists,
  priceListItems,
}: {
  initialDispatch: NonNullable<Props["initialDispatch"]>;
  initialLines: NonNullable<Props["initialLines"]>;
  suppliers: NonNullable<Props["suppliers"]>;
  locations: NonNullable<Props["locations"]>;
  products: NonNullable<Props["products"]>;
  priceLists: NonNullable<Props["priceLists"]>;
  priceListItems: NonNullable<Props["priceListItems"]>;
}) {
  const router = useRouter();
  return (
    <EmptiesDispatchFormDialog
      open
      inline
      onOpenChange={(open) => { if (!open) window.parent.postMessage({ type: "close-overlay" }, "*"); }}
      onSaved={() => router.refresh()}
      initialDispatch={initialDispatch}
      initialLines={initialLines}
      suppliers={suppliers}
      locations={locations}
      products={products}
      priceLists={priceLists}
      priceListItems={priceListItems}
    />
  );
}
