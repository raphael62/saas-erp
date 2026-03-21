import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, MapPin, History, ArrowLeftRight, AlertTriangle } from "lucide-react";

export default async function InventoryOverviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id?: string } | null)?.organization_id;
  if (!orgId) {
    return (
      <div>
        <p className="text-muted-foreground">Loading organization…</p>
      </div>
    );
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, name, stock_quantity, min_stock")
    .eq("organization_id", orgId);

  const productList = (products ?? []) as { name: string; stock_quantity: number; min_stock: number }[];
  const totalProducts = productList.length;
  const lowStockCount = productList.filter(
    (p) => Number(p.stock_quantity) <= Number(p.min_stock) && Number(p.min_stock) > 0
  ).length;

  const links = [
    { href: "/dashboard/inventory/products", label: "Products", icon: Package, stat: totalProducts },
    { href: "/dashboard/inventory/stocks-by-location", label: "Stocks by location", icon: MapPin, stat: "—" },
    { href: "/dashboard/inventory/change-history", label: "Change history", icon: History, stat: "—" },
    { href: "/dashboard/inventory/location-transfers", label: "Location Transfers", icon: ArrowLeftRight, stat: "—" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="text-muted-foreground mt-1">Overview of stock, products, and movements</p>
      </div>

      {lowStockCount > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                {lowStockCount} product{lowStockCount !== 1 ? "s" : ""} below reorder level
              </p>
              <Link href="/dashboard/inventory/products" className="text-sm text-amber-700 dark:text-amber-300 hover:underline">
                View products
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {links.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </CardTitle>
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  {item.stat}
                </span>
              </CardHeader>
              <CardContent>
                <Button variant="secondary" size="sm" asChild>
                  <span>Open</span>
                </Button>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
