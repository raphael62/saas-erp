"use client";

import Link from "next/link";
import { Plus, ShoppingCart, Truck, Package, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/inventory/products?add=1">
            <Package className="h-4 w-4 mr-1.5" />
            New product
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/sales/customers?add=1">
            <Users className="h-4 w-4 mr-1.5" />
            New customer
          </Link>
        </Button>
        <Button variant="outline" size="sm" disabled className="opacity-60">
          <ShoppingCart className="h-4 w-4 mr-1.5" />
          New sales order
        </Button>
        <Button variant="outline" size="sm" disabled className="opacity-60">
          <Truck className="h-4 w-4 mr-1.5" />
          New purchase order
        </Button>
    </div>
  );
}
