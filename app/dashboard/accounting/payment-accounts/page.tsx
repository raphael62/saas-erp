import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PaymentAccountsTable } from "@/components/accounting/payment-accounts-table";

export default async function PaymentAccountsPage() {
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

  const [accountsRes, chartRes] = await Promise.all([
    supabase
      .from("payment_accounts")
      .select("id,code,name,account_type,is_active,chart_of_account_id")
      .eq("organization_id", orgId)
      .order("code"),
    supabase
      .from("chart_of_accounts")
      .select("id,account_code,account_name")
      .eq("organization_id", orgId)
      .order("account_code"),
  ]);

  const tableMissing = Boolean(
    accountsRes.error && accountsRes.error.message.toLowerCase().includes("does not exist")
  );
  const list = tableMissing ? [] : (accountsRes.data ?? []);
  const chartAccounts = chartRes.error ? [] : (chartRes.data ?? []);

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
        <span className="text-foreground">Bank & Cash Accounts</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold">Bank & Cash Accounts</h1>
      </div>

      <PaymentAccountsTable
        accounts={list as Parameters<typeof PaymentAccountsTable>[0]["accounts"]}
        chartAccounts={chartAccounts as Parameters<typeof PaymentAccountsTable>[0]["chartAccounts"]}
        tableMissing={tableMissing}
      />
    </div>
  );
}
