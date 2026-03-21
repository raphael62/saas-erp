import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PurchasesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Purchases</h1>
        <p className="text-muted-foreground mt-1">Suppliers and purchase orders</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/dashboard/purchases/purchase-invoices">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Purchase Invoices</CardTitle>
              <CardDescription>Create and manage supplier invoices</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <span>Open</span>
              </Button>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/purchases/suppliers">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Suppliers</CardTitle>
              <CardDescription>Manage vendor records</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <span>Open</span>
              </Button>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/purchases/supplier-statement">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Supplier Statement</CardTitle>
              <CardDescription>AP ledger, purchases, payments, and empties credits</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <span>Open</span>
              </Button>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/purchases/empties-dispatch">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Empties Dispatch</CardTitle>
              <CardDescription>Dispatch returnables to suppliers</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <span>Open</span>
              </Button>
            </CardContent>
          </Card>
        </Link>
        <Card className="h-full opacity-75">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Purchase orders</CardTitle>
            <CardDescription>Coming soon</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
