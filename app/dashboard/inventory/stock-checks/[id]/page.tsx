import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

function n(v: unknown): number {
  return Number(v ?? 0);
}

function fmtQty(v: unknown): string {
  const x = n(v);
  if (!Number.isFinite(x)) return "0";
  const s = x.toFixed(4).replace(/\.?0+$/, "");
  return s || "0";
}

function locationLabel(l: { code?: string | null; name: string }) {
  const code = String(l.code ?? "").trim();
  const name = String(l.name ?? "").trim();
  return code ? `${code} - ${name}` : name;
}

type VanMeta = { sales_rep_id?: string; sales_date?: string; load_out_sheet_id?: string };

export default async function StockCheckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const { data: check, error: checkErr } = await supabase
    .from("stock_checks")
    .select(
      "id, count_date, location_id, stock_count_sheet_id, van_last_sales_dates, created_at, location:locations!location_id(id, code, name), stock_count_sheet:stock_count_sheets!stock_count_sheet_id(sheet_no)"
    )
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (checkErr) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm text-destructive">{checkErr.message}</p>
        <Link href="/dashboard/inventory/stock-checks" className="text-sm text-[var(--navbar)] hover:underline">
          Back to stock checks
        </Link>
      </div>
    );
  }
  if (!check) notFound();

  const { data: lineRows, error: linesErr } = await supabase
    .from("stock_check_lines")
    .select(
      "id, van_qty, counted_qty, system_location_qty, combined_qty, variance_qty, row_no, line_notes, product:products!product_id(id, code, name)"
    )
    .eq("stock_check_id", id)
    .eq("organization_id", orgId)
    .order("row_no", { ascending: true });

  if (linesErr) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm text-destructive">{linesErr.message}</p>
        <Link href="/dashboard/inventory/stock-checks" className="text-sm text-[var(--navbar)] hover:underline">
          Back to stock checks
        </Link>
      </div>
    );
  }

  const loc = check.location as { code?: string | null; name?: string } | { code?: string | null; name?: string }[] | null;
  const location = Array.isArray(loc) ? loc[0] : loc;
  const sheet = check.stock_count_sheet as { sheet_no?: string } | { sheet_no?: string }[] | null;
  const sheetRow = Array.isArray(sheet) ? sheet[0] : sheet;

  const vanMeta = (check as { van_last_sales_dates?: VanMeta[] | null }).van_last_sales_dates;
  const metaList = Array.isArray(vanMeta) ? vanMeta : [];

  const repIds = [...new Set(metaList.map((m) => String(m.sales_rep_id ?? "").trim()).filter(Boolean))];
  const repNameById = new Map<string, string>();
  if (repIds.length > 0) {
    const { data: reps } = await supabase.from("sales_reps").select("id, name").eq("organization_id", orgId).in("id", repIds);
    for (const r of reps ?? []) {
      const row = r as { id?: string; name?: string | null };
      if (row.id) repNameById.set(String(row.id), String(row.name ?? "").trim() || "—");
    }
  }

  const lines = lineRows ?? [];

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
        <Link href="/dashboard/inventory/stock-checks" className="hover:text-foreground">
          Stock Checks
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Detail</span>
      </nav>

      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Stock check</h1>
          <p className="text-sm text-muted-foreground">
            Count date {String(check.count_date ?? "").slice(0, 10)}
            {location ? ` · ${locationLabel({ code: location.code, name: String(location.name ?? "") })}` : ""}
            {sheetRow?.sheet_no ? ` · Sheet ${sheetRow.sheet_no}` : ""}
          </p>
        </div>

        {metaList.length > 0 && (
          <div className="rounded border border-border bg-card p-3 text-sm">
            <p className="mb-2 font-medium">Van load-outs used (latest per sales rep, sales date ≤ count date)</p>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              {metaList.map((m, i) => (
                <li key={`${m.load_out_sheet_id ?? i}-${i}`}>
                  {repNameById.get(String(m.sales_rep_id ?? "")) ?? "Rep"}{" "}
                  <span className="tabular-nums">· sales date {String(m.sales_date ?? "").slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="max-h-[calc(100vh-20rem)] overflow-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead
              className="sticky top-0 z-10"
              style={{ backgroundColor: "color-mix(in oklch, var(--navbar) 12%, white)" }}
            >
              <tr>
                <th className="border-b border-r border-border px-2 py-2 text-left font-medium">#</th>
                <th className="border-b border-r border-border px-2 py-2 text-left font-medium">Product</th>
                <th className="border-b border-r border-border px-2 py-2 text-right font-medium">Van</th>
                <th className="border-b border-r border-border px-2 py-2 text-right font-medium">Count</th>
                <th className="border-b border-r border-border px-2 py-2 text-right font-medium">Combined</th>
                <th className="border-b border-r border-border px-2 py-2 text-right font-medium">System</th>
                <th className="border-b border-border px-2 py-2 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    No lines.
                  </td>
                </tr>
              ) : (
                lines.map((ln: unknown, idx: number) => {
                  const row = ln as {
                    row_no?: number;
                    product?: { code?: string | null; name?: string } | { code?: string | null; name?: string }[] | null;
                    van_qty?: unknown;
                    counted_qty?: unknown;
                    combined_qty?: unknown;
                    system_location_qty?: unknown;
                    variance_qty?: unknown;
                    line_notes?: string | null;
                  };
                  const prod = Array.isArray(row.product) ? row.product[0] : row.product;
                  const label = prod
                    ? `${String(prod.code ?? "").trim() ? `${prod.code} · ` : ""}${String(prod.name ?? "—")}`
                    : "—";
                  const variance = n(row.variance_qty);
                  const varClass =
                    variance > 0 ? "text-emerald-700" : variance < 0 ? "text-destructive" : "text-muted-foreground";
                  return (
                    <tr
                      key={String((row as { id?: string }).id ?? idx)}
                      className={idx % 2 === 0 ? "bg-background" : "bg-muted/30"}
                    >
                      <td className="border-r border-border px-2 py-1.5 tabular-nums text-muted-foreground">
                        {row.row_no ?? idx + 1}
                      </td>
                      <td className="border-r border-border px-2 py-1.5">{label}</td>
                      <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">{fmtQty(row.van_qty)}</td>
                      <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">{fmtQty(row.counted_qty)}</td>
                      <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">{fmtQty(row.combined_qty)}</td>
                      <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">{fmtQty(row.system_location_qty)}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${varClass}`}>
                        {fmtQty(row.variance_qty)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Combined = van + count. Variance = combined − system (location balance).
        </p>
      </div>
    </div>
  );
}
