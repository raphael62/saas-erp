import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SupplierPayments } from "@/components/purchases/supplier-payments";

export default async function SupplierPaymentsPage({
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  const orgId = (profile as { organization_id?: string } | null)?.organization_id;
  if (!orgId) {
    return <p className="text-sm text-muted-foreground">Loading organization…</p>;
  }

  const [paymentsRes, suppliersRes, paymentMethodsRes, accountsRes] = await Promise.all([
    supabase
      .from("supplier_payments")
      .select(
        "id,payment_no,supplier_id,payment_date,bank_date,payment_account,payment_method,amount,reference,notes,cheque_no,purchase_invoice_id,created_at,suppliers(id,name,code)"
      )
      .eq("organization_id", orgId)
      .order("payment_date", { ascending: false })
      .order("payment_no", { ascending: false }),
    supabase
      .from("suppliers")
      .select("id,code,name,tax_id")
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

  const paymentsMissing = Boolean(
    paymentsRes.error && paymentsRes.error.message.toLowerCase().includes("does not exist")
  );
  if (paymentsRes.error && !paymentsMissing) {
    return <p className="text-destructive text-sm">{paymentsRes.error.message}</p>;
  }

  const payments = paymentsMissing ? [] : (paymentsRes.data ?? []);
  const suppliers = suppliersRes.error ? [] : (suppliersRes.data ?? []);
  const paymentMethods = paymentMethodsRes.error ? [] : (paymentMethodsRes.data ?? []);

  let paymentAccounts: string[] = [];
  if (!accountsRes.error && accountsRes.data?.length) {
    paymentAccounts = (accountsRes.data as Array<{ code?: string | null; name?: string | null }>)
      .map((a) => String(a.name ?? a.code ?? "").trim())
      .filter(Boolean);
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
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">
          Dashboard
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/dashboard/accounting" className="hover:text-foreground">
          Accounting & Finance
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Supplier Payments</span>
      </nav>

      <SupplierPayments
        payments={payments as Parameters<typeof SupplierPayments>[0]["payments"]}
        suppliers={suppliers as Parameters<typeof SupplierPayments>[0]["suppliers"]}
        paymentMethods={paymentMethods as Parameters<typeof SupplierPayments>[0]["paymentMethods"]}
        paymentAccounts={paymentAccounts}
        paymentsMissing={paymentsMissing}
        editId={editId}
      />
    </div>
  );
}
