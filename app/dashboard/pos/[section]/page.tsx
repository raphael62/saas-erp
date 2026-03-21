import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SsrTargets } from "@/components/pos/ssr-targets";

type PosSectionDef = {
  label: string;
  hint: string;
};

const SECTION_MAP: Record<string, PosSectionDef> = {
  "new-sale": {
    label: "New Sale",
    hint: "Start and process a fresh point-of-sale transaction.",
  },
  parked: {
    label: "Parked",
    hint: "Review and resume parked bills and pending carts.",
  },
  receipts: {
    label: "Receipts",
    hint: "Find issued receipts by date, amount, and customer.",
  },
  "daily-payments": {
    label: "Daily Payments",
    hint: "Track daily collections and payment method totals.",
  },
  targets: {
    label: "Targets",
    hint: "View POS targets for outlets, reps, and counters.",
  },
  performance: {
    label: "Performance",
    hint: "Monitor sales pace and operational performance trends.",
  },
  achievements: {
    label: "Achievements",
    hint: "See completed goals and milestone status.",
  },
  "monthly-review": {
    label: "Monthly Review",
    hint: "Summarize monthly POS outcomes and key metrics.",
  },
};

export default async function POSSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const def = SECTION_MAP[section];
  if (!def) notFound();

  if (section === "targets") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
    const orgId = (profile as { organization_id?: string } | null)?.organization_id;
    if (!orgId) {
      return (
        <div>
          <p className="text-muted-foreground">Loading organization...</p>
        </div>
      );
    }

    const ssrRes = await supabase
      .from("sales_ssr_monthly_targets")
      .select("id, sales_rep_id, month_start, target_value, commission_pct, notes, sales_reps(id, code, name)")
      .eq("organization_id", orgId)
      .order("month_start", { ascending: false });

    const repsRes = await supabase
      .from("sales_reps")
      .select("id, code, name, sales_rep_type, is_active")
      .eq("organization_id", orgId)
      .order("name");

    const missing = ssrRes.error && ssrRes.error.message.toLowerCase().includes("does not exist");
    if (missing) {
      return (
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">POS Targets</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Run the migration <code className="rounded bg-muted px-1">supabase/migrations/014_sales_targets.sql</code>{" "}
            in the Supabase SQL editor, then refresh.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Point of Sale</h1>
          <p className="mt-1 text-sm text-muted-foreground">POS targets workspace.</p>
        </div>
        <SsrTargets
          ssrTargets={(ssrRes.data ?? []) as Parameters<typeof SsrTargets>[0]["ssrTargets"]}
          reps={(repsRes.data ?? []) as Parameters<typeof SsrTargets>[0]["reps"]}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Point of Sale</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          POS operations workspace.
        </p>
      </div>

      <div className="rounded border border-border bg-card p-4">
        <h2 className="text-base font-semibold">{def.label}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{def.hint}</p>
      </div>
    </div>
  );
}

