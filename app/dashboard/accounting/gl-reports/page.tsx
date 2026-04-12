import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { defaultPlRange, todayISO } from "@/lib/financial-reports";
import { getBalanceSheet, getProfitAndLoss } from "./actions";
import { FinancialStatementsClient } from "./financial-statements-client";

export const dynamic = "force-dynamic";

export default async function GLReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { from, to } = defaultPlRange();
  const asOf = todayISO();

  const [pl, bs] = await Promise.all([getProfitAndLoss(from, to), getBalanceSheet(asOf)]);

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/dashboard/accounting" className="hover:text-foreground">
          Accounting
        </Link>
        <span>/</span>
        <span className="text-foreground">Financial statements</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold">Financial statements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Profit &amp; loss and balance sheet derived from sales, purchases, inventory, and payment activity (subledger view).
        </p>
      </div>

      <FinancialStatementsClient initialPl={pl} initialBs={bs} defaultFrom={from} defaultTo={to} defaultAsOf={asOf} />
    </div>
  );
}
