"use client";

import { useRouter } from "next/navigation";
import { SinglePaymentDialog, type Payment, type Customer, type PaymentMethod } from "@/components/sales/customer-payments";

export function PaymentPopupClient({
  payment,
  customers,
  paymentMethods,
  paymentAccounts,
}: {
  payment: Payment | null;
  customers: Customer[];
  paymentMethods: PaymentMethod[];
  paymentAccounts: string[];
}) {
  const router = useRouter();

  return (
    <SinglePaymentDialog
      open
      inline
      onOpenChange={(open) => { if (!open) window.parent.postMessage({ type: "close-overlay" }, "*"); }}
      onSaved={() => router.refresh()}
      initialPayment={payment}
      customers={customers}
      paymentMethods={paymentMethods}
      paymentAccounts={paymentAccounts}
    />
  );
}
