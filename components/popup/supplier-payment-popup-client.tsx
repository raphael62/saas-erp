"use client";

import { useRouter } from "next/navigation";
import { SinglePaymentDialog } from "@/components/purchases/supplier-payments";

type Props = Parameters<typeof SinglePaymentDialog>[0];

export function SupplierPaymentPopupClient({
  initialPayment,
  suppliers,
  paymentMethods,
  paymentAccounts,
}: {
  initialPayment: NonNullable<Props["initialPayment"]>;
  suppliers: Props["suppliers"];
  paymentMethods: Props["paymentMethods"];
  paymentAccounts: Props["paymentAccounts"];
}) {
  const router = useRouter();
  return (
    <SinglePaymentDialog
      open
      inline
      onOpenChange={(open) => { if (!open) window.parent.postMessage({ type: "close-overlay" }, "*"); }}
      onSaved={() => router.refresh()}
      initialPayment={initialPayment}
      suppliers={suppliers}
      paymentMethods={paymentMethods}
      paymentAccounts={paymentAccounts}
    />
  );
}
