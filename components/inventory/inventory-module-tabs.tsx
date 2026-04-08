"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: Array<{ href: string; label: string }> = [
  { href: "/dashboard/inventory", label: "Overview" },
  { href: "/dashboard/inventory/products", label: "Products" },
  { href: "/dashboard/inventory/stocks-by-location", label: "Stock by Location" },
  { href: "/dashboard/inventory/change-history", label: "Stock Movements" },
  { href: "/dashboard/inventory/location-transfers", label: "Location Transfers" },
  { href: "/dashboard/inventory/stock-count-sheets", label: "Stock Count Sheets" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard/inventory") {
    return pathname === "/dashboard/inventory" || pathname === "/dashboard/inventory/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function InventoryModuleTabs() {
  const pathname = usePathname() || "";

  return (
    <div className="flex flex-wrap gap-1 border-b border-border pb-2">
      {TABS.map((tab) => {
        const active = isActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            style={active ? { backgroundColor: "var(--navbar)" } : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
