import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CustomerPayments } from "@/components/sales/customer-payments";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";
import { isTableUnavailableError, isSchemaCacheError } from "@/lib/supabase/table-missing";

export default async function CustomerPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const editId = typeof params.edit === "string" ? params.edit : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const [paymentsRes, customersRes, paymentMethodsRes, accountsRes] = await Promise.all([
    supabase
      .from("customer_payments")
      .select("id,payment_no,customer_id,payment_date,bank_date,payment_account,payment_method,amount,reference,notes,created_at,customers(id,name,tax_id)")
      .eq("organization_id", orgId)
      .order("payment_date", { ascending: false })
      .order("payment_no", { ascending: false }),
    supabase
      .from("customers")
      .select("id,name,tax_id,phone,contact_person")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("payment_methods")
      .select("code,name")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("payment_accounts")
      .select("code,name")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("code"),
  ]);

  const paymentsMissing = Boolean(paymentsRes.error && isTableUnavailableError(paymentsRes.error));
  const schemaCacheStale = Boolean(paymentsRes.error && isSchemaCacheError(paymentsRes.error));
  if (paymentsRes.error && !paymentsMissing) {
    return <p className="text-destructive text-sm">{paymentsRes.error.message}</p>;
  }

  const payments = paymentsMissing ? [] : paymentsRes.data ?? [];
  const customers = customersRes.error ? [] : customersRes.data ?? [];
  const paymentMethods = paymentMethodsRes.error ? [] : paymentMethodsRes.data ?? [];

  let paymentAccounts: string[] = [];
  if (!accountsRes.error && accountsRes.data?.length) {
    paymentAccounts = (accountsRes.data as Array<{ code?: string | null; name?: string | null }>).map(
      (a) => String(a.name ?? a.code ?? "").trim()
    ).filter(Boolean);
  }
  if (paymentAccounts.length === 0) {
    const accountSet = new Set<string>();
    for (const p of payments as Array<{ payment_account?: string | null }>) {
      const account = String(p.payment_account ?? "").trim();
      if (account) accountSet.add(account);
    }
    paymentAccounts = Array.from(accountSet);
  }

  return (
    <CustomerPayments
      payments={payments as Parameters<typeof CustomerPayments>[0]["payments"]}
      customers={customers as Parameters<typeof CustomerPayments>[0]["customers"]}
      paymentMethods={paymentMethods as Parameters<typeof CustomerPayments>[0]["paymentMethods"]}
      paymentAccounts={paymentAccounts}
      paymentsMissing={paymentsMissing}
      schemaCacheStale={schemaCacheStale}
      editId={editId}
    />
  );
}
