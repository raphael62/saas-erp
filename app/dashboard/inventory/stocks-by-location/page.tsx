import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

export default async function StocksByLocationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  const { data: products } = await supabase
    .from("products")
    .select("id, name, sku, category, unit, stock_quantity")
    .eq("organization_id", orgId)
    .order("name");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Stocks by location</h1>
        <p className="text-sm text-muted-foreground">Product stock levels (default location)</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {(products ?? []).length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">No products yet. Add products first.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">Product</th>
                    <th className="px-4 py-3 text-left font-medium">SKU</th>
                    <th className="px-4 py-3 text-left font-medium">Category</th>
                    <th className="px-4 py-3 text-left font-medium">Unit</th>
                    <th className="px-4 py-3 text-right font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {(products ?? []).map((p: { id: string; name: string; sku: string | null; category: string | null; unit: string; stock_quantity: number }) => (
                    <tr key={p.id} className="border-b border-border hover:bg-muted/30">
                      <td className="px-4 py-3">{p.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.sku ?? "—"}</td>
                      <td className="px-4 py-3">{p.category ?? "—"}</td>
                      <td className="px-4 py-3">{p.unit}</td>
                      <td className="px-4 py-3 text-right font-medium">{Number(p.stock_quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
