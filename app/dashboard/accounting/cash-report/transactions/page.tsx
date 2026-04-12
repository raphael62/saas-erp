import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";
import { defaultCashReportRange, parseISODate } from "@/lib/financial-reports";
import { getCashAccountTransactions } from "../actions";
import { CashTransactionsClient } from "./cash-transactions-client";

export const dynamic = "force-dynamic";

export default async function CashReportTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const paymentAccountId = typeof params.paymentAccountId === "string" ? params.paymentAccountId : "";
  const from = typeof params.from === "string" ? params.from : "";
  const to = typeof params.to === "string" ? params.to : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const { data: orgRow } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const orgName = String((orgRow as { name?: string } | null)?.name ?? "Organization");

  const fromOk = parseISODate(from);
  const toOk = parseISODate(to);
  const result =
    paymentAccountId && fromOk && toOk
      ? await getCashAccountTransactions(paymentAccountId, fromOk, toOk)
      : ({ ok: false as const, error: "Select an account and date range from the cash report." } as const);

  const dr = defaultCashReportRange();
  const backHref = `/dashboard/accounting/cash-report?from=${encodeURIComponent(fromOk ?? dr.from)}&to=${encodeURIComponent(toOk ?? dr.to)}`;

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
        <Link href="/dashboard/accounting/cash-report" className="hover:text-foreground">
          Cash Report
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Transactions</span>
      </nav>

      <CashTransactionsClient
        orgName={orgName}
        result={result}
        from={fromOk ?? ""}
        to={toOk ?? ""}
        backHref={backHref}
      />
    </div>
  );
}
