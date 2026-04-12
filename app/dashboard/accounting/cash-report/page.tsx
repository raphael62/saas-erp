import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";
import { defaultCashReportRange, parseISODate } from "@/lib/financial-reports";
import { getCashReport } from "./actions";
import { CashReportClient } from "./cash-report-client";

export const dynamic = "force-dynamic";

export default async function CashReportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const params = await searchParams;
  const fromParam = typeof params.from === "string" ? parseISODate(params.from) : null;
  const toParam = typeof params.to === "string" ? parseISODate(params.to) : null;
  const defaults = defaultCashReportRange();
  const from = fromParam ?? defaults.from;
  const to = toParam ?? defaults.to;

  const { data: orgRow } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const orgName = String((orgRow as { name?: string } | null)?.name ?? "Organization");

  const initialReport = await getCashReport(from, to);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground print:hidden">
        <Link href="/dashboard" className="hover:text-foreground">
          Dashboard
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/dashboard/accounting" className="hover:text-foreground">
          Accounting & Finance
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Cash Report</span>
      </nav>

      <CashReportClient orgName={orgName} initialReport={initialReport} defaultFrom={from} defaultTo={to} />
    </div>
  );
}
