"use client";

import { useRouter } from "next/navigation";
import { PurchaseInvoiceFormDialog } from "@/components/purchases/purchase-invoice-form-dialog";

type Props = Parameters<typeof PurchaseInvoiceFormDialog>[0];

export function PurchaseInvoicePopupClient({
  initialInvoice,
  initialLines,
  products,
  suppliers,
  locations,
  priceLists,
  priceListItems,
  organizationId,
}: {
  initialInvoice: NonNullable<Props["initialInvoice"]>;
  initialLines: Props["initialLines"];
  products: Props["products"];
  suppliers: Props["suppliers"];
  locations: Props["locations"];
  priceLists: Props["priceLists"];
  priceListItems: Props["priceListItems"];
  organizationId: string;
}) {
  const router = useRouter();
  return (
    <PurchaseInvoiceFormDialog
      open
      inline
      onOpenChange={(open) => { if (!open) window.parent.postMessage({ type: "close-overlay" }, "*"); }}
      onSaved={() => router.refresh()}
      organizationId={organizationId}
      initialInvoice={initialInvoice}
      initialLines={initialLines}
      products={products}
      suppliers={suppliers}
      locations={locations}
      priceLists={priceLists}
      priceListItems={priceListItems}
      invoices={[initialInvoice]}
    />
  );
}
