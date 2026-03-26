import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";
import { ChangeHistoryView } from "@/components/inventory/change-history-view";
import { getInventoryChangeHistory } from "./actions";

export const dynamic = "force-dynamic";

export default async function ChangeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    include_inactive?: string;
    exclude_no_txn?: string;
    item_q?: string;
    category_q?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const params = await searchParams;
  const fromParam = typeof params.from === "string" ? params.from : undefined;
  const toParam = typeof params.to === "string" ? params.to : undefined;
  const includeInactive = params.include_inactive === "1";
  const excludeNoTxn = params.exclude_no_txn === "1";
  const itemQ = typeof params.item_q === "string" ? params.item_q : "";
  const categoryQ = typeof params.category_q === "string" ? params.category_q : "";

  const { rows, from, to, error } = await getInventoryChangeHistory(orgId, fromParam, toParam, {
    includeInactive,
    excludeNoTransactions: excludeNoTxn,
    itemContains: itemQ || null,
    categoryContains: categoryQ || null,
  });

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-xl font-semibold">Change history</h1>
        <p className="text-sm text-muted-foreground">
          Stock movement summary by period in <strong>cartons</strong>. Opening is a ledger net movement from your
          organization go-live date (<code className="text-xs">organizations.inventory_history_start_date</code>) up to
          the day before the selected range. Purchases include purchase invoices (CTN + bottles to cartons) plus empties
          receives/market buys for empties SKUs; sales include posted invoice CL + free plus empties dispatch quantities.
          Closing = Opening + Purchases − Sales, and <strong>Order</strong> = Sales − Closing. Cost and Sale values use
          current product prices from <code className="text-xs">product_prices</code> by fixed price type codes{" "}
          <code className="text-xs">COST</code> and <code className="text-xs">RETAIL</code>.
        </p>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChangeHistoryView
          rows={rows}
          from={from}
          to={to}
          error={error}
          includeInactive={includeInactive}
          excludeNoTransactions={excludeNoTxn}
          itemQ={itemQ}
          categoryQ={categoryQ}
        />
      </div>
    </div>
  );
}
