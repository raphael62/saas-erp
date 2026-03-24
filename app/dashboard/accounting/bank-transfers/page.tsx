import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BankTransfers } from "@/components/accounting/bank-transfers";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

export default async function BankTransfersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const [transfersRes, accountsRes] = await Promise.all([
    supabase
      .from("bank_transfers")
      .select(
        "id, transfer_no, transfer_date, from_account_id, to_account_id, amount, reference, notes, from_accounts:payment_accounts!from_account_id(id, code, name), to_accounts:payment_accounts!to_account_id(id, code, name)"
      )
      .eq("organization_id", orgId)
      .order("transfer_date", { ascending: false })
      .order("transfer_no", { ascending: false }),
    supabase
      .from("payment_accounts")
      .select("id, code, name, account_type")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("code"),
  ]);

  const tableMissing = Boolean(
    transfersRes.error && transfersRes.error.message.toLowerCase().includes("does not exist")
  );
  const transfers = tableMissing ? [] : (transfersRes.data ?? []);
  const accounts = accountsRes.error ? [] : (accountsRes.data ?? []);

  const normalizedTransfers = transfers.map((t: unknown) => {
    const row = t as {
      from_accounts?: unknown;
      to_accounts?: unknown;
      [key: string]: unknown;
    };
    const from = Array.isArray(row.from_accounts) ? row.from_accounts[0] : row.from_accounts;
    const to = Array.isArray(row.to_accounts) ? row.to_accounts[0] : row.to_accounts;
    const { from_accounts, to_accounts, ...rest } = row;
    return { ...rest, from_accounts: from, to_accounts: to };
  });

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
        <span className="text-foreground">Bank Transfers</span>
      </nav>

      <BankTransfers
        transfers={normalizedTransfers as Parameters<typeof BankTransfers>[0]["transfers"]}
        accounts={accounts as Parameters<typeof BankTransfers>[0]["accounts"]}
        tableMissing={tableMissing}
      />
    </div>
  );
}
