import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountingOverviewSummary } from "@/app/dashboard/accounting/gl-reports/actions";

export const dynamic = "force-dynamic";

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function AccountingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const summary = await getAccountingOverviewSummary();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Accounting &amp; Finance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chart of accounts, cash movements, and financial statements from your operational data.
        </p>
      </div>

      {summary.ok ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Accounts receivable (outstanding)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtMoney(summary.arOutstanding)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Accounts payable (outstanding)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtMoney(summary.apOutstanding)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">MTD sales revenue (posted)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtMoney(summary.mtdRevenue)}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{summary.error}</p>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Financial statements</h2>
        <Link
          href="/dashboard/accounting/gl-reports"
          className="inline-flex items-center rounded-md border border-border bg-muted/30 px-4 py-2 text-sm font-medium text-[var(--navbar)] hover:bg-muted/50"
        >
          Profit &amp; Loss &amp; Balance Sheet
        </Link>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Cash</h2>
        <Link
          href="/dashboard/accounting/cash-report"
          className="inline-flex items-center rounded-md border border-border bg-muted/30 px-4 py-2 text-sm font-medium text-[var(--navbar)] hover:bg-muted/50"
        >
          Cash Report
        </Link>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Shortcuts</h2>
        <ul className="flex flex-wrap gap-3 text-sm">
          <li>
            <Link href="/dashboard/accounting/chart-of-accounts" className="text-[var(--navbar)] underline">
              Chart of accounts
            </Link>
          </li>
          <li>
            <Link href="/dashboard/accounting/payment-accounts" className="text-[var(--navbar)] underline">
              Bank &amp; cash accounts
            </Link>
          </li>
          <li>
            <Link href="/dashboard/sales/customer-payments" className="text-[var(--navbar)] underline">
              Customer payments
            </Link>
          </li>
          <li>
            <Link href="/dashboard/accounting/supplier-payments" className="text-[var(--navbar)] underline">
              Supplier payments
            </Link>
          </li>
          <li>
            <Link href="/dashboard/accounting/bank-transfers" className="text-[var(--navbar)] underline">
              Bank transfers
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
