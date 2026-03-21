"use client";

import Link from "next/link";

interface ActivitiesPanelProps {
  productCount: number;
  customerCount: number;
  lowStockCount: number;
}

export function ActivitiesPanel({ productCount, customerCount, lowStockCount }: ActivitiesPanelProps) {
  return (
    <div className="space-y-1 text-sm">
        <Link href="/dashboard/inventory/products" className="flex justify-between rounded px-2 py-1.5 hover:bg-muted">
          <span className="text-muted-foreground">Products</span>
          <span className="font-medium">{productCount}</span>
        </Link>
        <Link href="/dashboard/sales/customers" className="flex justify-between rounded px-2 py-1.5 hover:bg-muted">
          <span className="text-muted-foreground">Customers</span>
          <span className="font-medium">{customerCount}</span>
        </Link>
        <Link href="/dashboard/inventory/products" className="flex justify-between rounded px-2 py-1.5 hover:bg-muted">
          <span className="text-muted-foreground">Low stock items</span>
          <span className={lowStockCount > 0 ? "font-medium text-amber-600" : "font-medium"}>{lowStockCount}</span>
        </Link>
    </div>
  );
}
