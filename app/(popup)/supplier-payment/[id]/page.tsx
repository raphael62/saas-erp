import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";
import { getPaymentAccountAccessForUser } from "@/lib/payment-account-access";
import { SupplierPaymentPopupClient } from "@/components/popup/supplier-payment-popup-client";

export default async function SupplierPaymentPopupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const [paymentRes, suppliersRes, paymentMethodsRes, accountsRes] = await Promise.all([
    supabase
      .from("supplier_payments")
      .select(
        "id,payment_no,supplier_id,payment_date,bank_date,payment_account,payment_method,amount,reference,notes,cheque_no,purchase_invoice_id,created_at,suppliers(id,name,code)"
      )
      .eq("organization_id", orgId)
      .eq("id", id)
      .single(),
    supabase.from("suppliers").select("id,code,name,tax_id").eq("organization_id", orgId).eq("is_active", true).order("name"),
    supabase.from("payment_methods").select("code,name").eq("organization_id", orgId).eq("is_active", true).order("name"),
    supabase.from("payment_accounts").select("id,code,name").eq("organization_id", orgId).eq("is_active", true).order("code"),
  ]);

  if (paymentRes.error || !paymentRes.data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Supplier payment not found or access denied.
      </div>
    );
  }

  const payAccess = await getPaymentAccountAccessForUser(supabase, user.id, orgId);
  const accountRows = (accountsRes.data ?? []) as Array<{ id: string; code?: string | null; name?: string | null }>;
  const rowsForUser = payAccess.unrestricted ? accountRows : accountRows.filter((a) => payAccess.allowedIds.has(a.id));
  const paymentAccounts = rowsForUser.map((a) => String(a.name ?? a.code ?? "").trim()).filter(Boolean);

  return (
    <SupplierPaymentPopupClient
      initialPayment={paymentRes.data as unknown as Parameters<typeof SupplierPaymentPopupClient>[0]["initialPayment"]}
      suppliers={(suppliersRes.data ?? []) as Parameters<typeof SupplierPaymentPopupClient>[0]["suppliers"]}
      paymentMethods={(paymentMethodsRes.data ?? []) as Parameters<typeof SupplierPaymentPopupClient>[0]["paymentMethods"]}
      paymentAccounts={paymentAccounts}
    />
  );
}
