"use client";

import { useRouter } from "next/navigation";
import { SalesInvoiceFormDialog } from "@/components/sales/sales-invoice-form-dialog";

type Props = Parameters<typeof SalesInvoiceFormDialog>[0];

export function InvoicePopupClient({
  invoice,
  lines,
  products,
  customers,
  salesReps,
  locations,
  priceTypes,
  priceLists,
  priceListItems,
  organizationId,
}: {
  invoice: NonNullable<Props["initialInvoice"]>;
  lines: NonNullable<Props["initialLines"]>;
  products: NonNullable<Props["products"]>;
  customers: NonNullable<Props["customers"]>;
  salesReps: NonNullable<Props["salesReps"]>;
  locations: NonNullable<Props["locations"]>;
  priceTypes: NonNullable<Props["priceTypes"]>;
  priceLists: NonNullable<Props["priceLists"]>;
  priceListItems: NonNullable<Props["priceListItems"]>;
  organizationId: string;
}) {
  const router = useRouter();

  return (
    <SalesInvoiceFormDialog
      open
      inline
      onOpenChange={(open) => { if (!open) window.parent.postMessage({ type: "close-overlay" }, "*"); }}
      onSaved={() => router.refresh()}
      organizationId={organizationId}
      initialInvoice={invoice}
      initialLines={lines}
      products={products}
      customers={customers}
      salesReps={salesReps}
      locations={locations}
      priceTypes={priceTypes}
      priceLists={priceLists}
      priceListItems={priceListItems}
      promotions={[]}
      promotionRules={[]}
      invoices={[invoice]}
      salesOrders={[]}
      salesOrderLines={[]}
      loadOutSheets={[]}
      loadOutSheetLines={[]}
    />
  );
}
