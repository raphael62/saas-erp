import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";
import { isTableUnavailableError } from "@/lib/supabase/table-missing";
import { getPaymentAccountAccessForUser } from "@/lib/payment-account-access";
import { PaymentPopupClient } from "@/components/popup/payment-popup-client";

export default async function PaymentPopupPage({
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

  const [paymentRes, customersRes, paymentMethodsRes, accountsRes] = await Promise.all([
    supabase
      .from("customer_payments")
      .select("id,payment_no,customer_id,payment_date,bank_date,payment_account,payment_method,amount,reference,notes,created_at,customers(id,name,tax_id)")
      .eq("organization_id", orgId)
      .eq("id", id)
      .single(),
    supabase.from("customers").select("id,name,tax_id,phone,contact_person").eq("organization_id", orgId).eq("is_active", true).order("name"),
    supabase.from("payment_methods").select("code,name").eq("organization_id", orgId).eq("is_active", true).order("name"),
    supabase.from("payment_accounts").select("id,code,name").eq("organization_id", orgId).eq("is_active", true).order("code"),
  ]);

  const paymentMissing = Boolean(paymentRes.error && isTableUnavailableError(paymentRes.error));

  if (!paymentMissing && (paymentRes.error || !paymentRes.data)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Payment not found or access denied.
      </div>
    );
  }

  const customers = customersRes.error ? [] : customersRes.data ?? [];
  const paymentMethods = paymentMethodsRes.error ? [] : paymentMethodsRes.data ?? [];
  const payAccess = await getPaymentAccountAccessForUser(supabase, user.id, orgId);
  const accountRows = (accountsRes.data ?? []) as Array<{ id: string; code?: string | null; name?: string | null }>;
  const rowsForUser = payAccess.unrestricted ? accountRows : accountRows.filter((a) => payAccess.allowedIds.has(a.id));
  const paymentAccounts = rowsForUser.map((a) => String(a.name ?? a.code ?? "").trim()).filter(Boolean);

  return (
    <PaymentPopupClient
      payment={paymentRes.data as Parameters<typeof PaymentPopupClient>[0]["payment"]}
      customers={customers as Parameters<typeof PaymentPopupClient>[0]["customers"]}
      paymentMethods={paymentMethods as Parameters<typeof PaymentPopupClient>[0]["paymentMethods"]}
      paymentAccounts={paymentAccounts}
    />
  );
}
