import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ChartOfAccountsTable } from "@/components/accounting/chart-of-accounts-table";

export default async function ChartOfAccountsPage() {
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
    return <p className="text-muted-foreground text-sm">Loading organization…</p>;
  }

  const { data: accounts, error } = await supabase
    .from("chart_of_accounts")
    .select("id,parent_id,account_code,account_name,account_type,sub_type,dr_cr,opening_balance_ghs,current_balance_ghs,is_active")
    .eq("organization_id", orgId)
    .order("account_code");

  const tableMissing = Boolean(
    error && error.message.toLowerCase().includes("does not exist")
  );
  const list = tableMissing ? [] : (accounts ?? []);

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
        <span className="text-foreground">Chart of Accounts</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold">Chart of Accounts Management</h1>
      </div>

      <ChartOfAccountsTable
        accounts={list as Parameters<typeof ChartOfAccountsTable>[0]["accounts"]}
        tableMissing={tableMissing}
      />
    </div>
  );
}
