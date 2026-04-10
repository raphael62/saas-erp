import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

function locationLabel(l: { code?: string | null; name: string }) {
  const code = String(l.code ?? "").trim();
  const name = String(l.name ?? "").trim();
  return code ? `${code} - ${name}` : name;
}

export default async function StockChecksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const { data: rows, error } = await supabase
    .from("stock_checks")
    .select(
      "id, count_date, location_id, stock_count_sheet_id, created_at, location:locations!location_id(id, code, name), stock_count_sheet:stock_count_sheets!stock_count_sheet_id(sheet_no)"
    )
    .eq("organization_id", orgId)
    .order("count_date", { ascending: false })
    .order("created_at", { ascending: false });

  const tableMissing = Boolean(
    error &&
      (error.message.toLowerCase().includes("does not exist") ||
        error.message.toLowerCase().includes("schema cache"))
  );

  const checks = tableMissing ? [] : (rows ?? []);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">
          Dashboard
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/dashboard/inventory" className="hover:text-foreground">
          Inventory
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Stock Checks</span>
      </nav>

      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold">Stock Checks</h1>
          <p className="text-sm text-muted-foreground">
            Snapshots from saved stock count sheets: van load-out totals, physical count, system balance, and variance.
          </p>
        </div>

        {tableMissing && (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Stock check tables are missing. Apply <code className="rounded bg-muted px-1">supabase/migrations/064_stock_checks.sql</code>.
          </p>
        )}

        {!tableMissing && error && (
          <p className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error.message}
          </p>
        )}

        <div className="max-h-[calc(100vh-14rem)] overflow-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead
              className="sticky top-0 z-10"
              style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 12%, white)" }}
            >
              <tr>
                <th className="border-b border-r border-border px-2 py-2 text-left font-medium">Count date</th>
                <th className="border-b border-r border-border px-2 py-2 text-left font-medium">Location</th>
                <th className="border-b border-r border-border px-2 py-2 text-left font-medium">Stock count sheet</th>
                <th className="border-b border-border px-2 py-2 text-left font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {checks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    {tableMissing
                      ? "No data."
                      : "No stock checks yet. Save a stock count sheet to generate one."}
                  </td>
                </tr>
              ) : (
                checks.map((row: unknown, idx: number) => {
                  const r = row as {
                    id: string;
                    count_date: string;
                    location?: { code?: string | null; name?: string } | { code?: string | null; name?: string }[] | null;
                    stock_count_sheet?: { sheet_no?: string } | { sheet_no?: string }[] | null;
                  };
                  const loc = Array.isArray(r.location) ? r.location[0] : r.location;
                  const sheet = Array.isArray(r.stock_count_sheet) ? r.stock_count_sheet[0] : r.stock_count_sheet;
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-border last:border-0 ${
                        idx % 2 === 0 ? "bg-background" : "bg-muted/30"
                      }`}
                    >
                      <td className="border-r border-border px-2 py-1.5 tabular-nums">
                        {String(r.count_date ?? "").slice(0, 10)}
                      </td>
                      <td className="border-r border-border px-2 py-1.5">
                        {loc ? locationLabel({ code: loc.code, name: String(loc.name ?? "") }) : "—"}
                      </td>
                      <td className="border-r border-border px-2 py-1.5">{String(sheet?.sheet_no ?? "—")}</td>
                      <td className="px-2 py-1.5">
                        <Link
                          href={`/dashboard/inventory/stock-checks/${r.id}`}
                          className="text-[var(--navbar)] hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
