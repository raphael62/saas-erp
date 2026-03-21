import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActivitiesPanel } from "@/components/dashboard/activities-panel";
import { QuickActions } from "@/components/dashboard/quick-actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id?: string } | null)?.organization_id;

  let productCount = 0;
  let customerCount = 0;
  let lowStockCount = 0;

  if (orgId) {
    const productsRes = await supabase.from("products").select("id, stock_quantity, min_stock").eq("organization_id", orgId);
    const products = (productsRes.data ?? []) as { stock_quantity: number; min_stock: number }[];
    productCount = products.length;
    lowStockCount = products.filter((p) => Number(p.stock_quantity) <= Number(p.min_stock) && Number(p.min_stock) > 0).length;

    try {
      const customersRes = await supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
      customerCount = customersRes.count ?? 0;
    } catch {
      // customers table may not exist yet; run ADD_CUSTOMERS.sql
    }
  }

  const modules = [
    { title: "Sales", href: "/dashboard/sales", desc: "Orders and customers", stat: customerCount },
    { title: "Purchases", href: "/dashboard/purchases", desc: "Suppliers and POs", stat: "—" },
    { title: "Inventory", href: "/dashboard/inventory", desc: "Stock and movements", stat: productCount },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your ERP modules</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((item) => (
              <Link key={item.title} href={item.href}>
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                      {item.stat}
                    </span>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{item.desc}</CardDescription>
                    <Button variant="secondary" size="sm" className="mt-3" asChild>
                      <span>Open</span>
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick actions</CardTitle>
            </CardHeader>
            <CardContent>
              <QuickActions />
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activities</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivitiesPanel productCount={productCount} customerCount={customerCount} lowStockCount={lowStockCount} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
