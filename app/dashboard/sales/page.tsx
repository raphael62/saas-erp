import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SalesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Sales</h1>
        <p className="text-muted-foreground mt-1">Orders and customers</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/dashboard/sales/customers">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Customers</CardTitle>
              <CardDescription>Manage customer records</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <span>Open</span>
              </Button>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/sales/price-list">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Price List</CardTitle>
              <CardDescription>Manage product prices by price type</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <span>Open</span>
              </Button>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/sales/van-stock-requests">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Van Stock Requests</CardTitle>
              <CardDescription>Request stock for van loading (top up, 2nd load, returns)</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <span>Open</span>
              </Button>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/sales/load-out-sheets">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Load Out Sheets</CardTitle>
              <CardDescription>Auto-created from approved stock requests and used for van operations</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <span>Open</span>
              </Button>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/sales/targets">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sales Targets</CardTitle>
              <CardDescription>Manage monthly VSR targets by product</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <span>Open</span>
              </Button>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/sales/sales-invoices">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sales Invoices</CardTitle>
              <CardDescription>Create, post, and track customer invoices</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <span>Open</span>
              </Button>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/sales/customer-statement">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Customer Statement</CardTitle>
              <CardDescription>View sales, payments, and running customer balances</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <span>Open</span>
              </Button>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/sales/customer-payments">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Customer Payments</CardTitle>
              <CardDescription>Record single or batch customer payments</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <span>Open</span>
              </Button>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/sales/promotions">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Promotions</CardTitle>
              <CardDescription>Buy A - Get B rules auto-applied in invoices</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <span>Open</span>
              </Button>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/sales/empties-receive">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Empties Receive</CardTitle>
              <CardDescription>Receive empties from customers</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <span>Open</span>
              </Button>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/sales/customer-empties-statement">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Customer Empties Statement</CardTitle>
              <CardDescription>View opening, expected, sold, received, and balance</CardDescription>
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
            <CardTitle className="text-base">Sales orders</CardTitle>
            <CardDescription>Coming soon</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
