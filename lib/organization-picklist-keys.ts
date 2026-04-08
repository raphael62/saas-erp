/** Keys for `organization_picklists` / `organization_picklist_suppressions` (must match migration check). */
export const PICKLIST_KEYS = {
  salesInvoiceDriver: "sales_invoice_driver",
  salesInvoiceVehicle: "sales_invoice_vehicle",
  purchaseInvoiceTransporter: "purchase_invoice_transporter",
  purchaseInvoiceDriver: "purchase_invoice_driver",
  purchaseInvoiceVehicle: "purchase_invoice_vehicle",
} as const;

export type PicklistKey = (typeof PICKLIST_KEYS)[keyof typeof PICKLIST_KEYS];
