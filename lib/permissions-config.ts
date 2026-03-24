/**
 * Permission tree for the Roles & Permissions matrix and canAccess lookups.
 * Kept in sync with nav-config. Includes iconKey for matrix display.
 */

import type { NavIconKey } from "./nav-items";

export type PermissionPage = { pageKey: string; label: string; href: string; iconKey: NavIconKey };

export type PermissionNode = {
  moduleKey: string;
  label: string;
  iconKey: NavIconKey;
  children?: PermissionPage[];
};

/** Static permission tree mirroring nav structure. */
export const permissionTree: PermissionNode[] = [
  {
    moduleKey: "dashboard",
    label: "Dashboard",
    iconKey: "LayoutDashboard",
    children: [
      { pageKey: "overview", label: "Overview", href: "/dashboard", iconKey: "LayoutDashboard" },
      { pageKey: "kpis", label: "KPIs", href: "/dashboard/kpis", iconKey: "BarChart3" },
      { pageKey: "sync-log", label: "Sync Log", href: "/dashboard/sync-log", iconKey: "RefreshCw" },
      { pageKey: "notifications", label: "Notifications", href: "/dashboard/notifications", iconKey: "Bell" },
    ],
  },
  {
    moduleKey: "purchases",
    label: "Purchases",
    iconKey: "Truck",
    children: [
      { pageKey: "overview", label: "Overview", href: "/dashboard/purchases", iconKey: "Truck" },
      { pageKey: "suppliers", label: "Suppliers", href: "/dashboard/purchases/suppliers", iconKey: "Truck" },
      { pageKey: "purchase-invoices", label: "Purchase Invoices", href: "/dashboard/purchases/purchase-invoices", iconKey: "CreditCard" },
      { pageKey: "supplier-statement", label: "Supplier Statement", href: "/dashboard/purchases/supplier-statement", iconKey: "FileText" },
      { pageKey: "empties-dispatch", label: "Empties Dispatch", href: "/dashboard/purchases/empties-dispatch", iconKey: "Recycle" },
    ],
  },
  {
    moduleKey: "sales",
    label: "Sales",
    iconKey: "ShoppingCart",
    children: [
      { pageKey: "overview", label: "Overview", href: "/dashboard/sales", iconKey: "ShoppingCart" },
      { pageKey: "sales-orders", label: "Sales Orders", href: "/dashboard/sales/sales-orders", iconKey: "FileCheck" },
      { pageKey: "customers", label: "Customers", href: "/dashboard/sales/customers", iconKey: "Users" },
      { pageKey: "sales-reps", label: "Sales reps", href: "/dashboard/sales/sales-reps", iconKey: "Users" },
      { pageKey: "targets", label: "Sales Targets", href: "/dashboard/sales/targets", iconKey: "Target" },
      { pageKey: "van-stock-requests", label: "Van Stock Requests", href: "/dashboard/sales/van-stock-requests", iconKey: "ClipboardList" },
      { pageKey: "load-out-sheets", label: "Load Out Sheets", href: "/dashboard/sales/load-out-sheets", iconKey: "FileStack" },
      { pageKey: "price-list", label: "Price List", href: "/dashboard/sales/price-list", iconKey: "BarChart3" },
      { pageKey: "promotions", label: "Promotions", href: "/dashboard/sales/promotions", iconKey: "Gift" },
      { pageKey: "sales-invoices", label: "Sales Invoices", href: "/dashboard/sales/sales-invoices", iconKey: "CreditCard" },
      { pageKey: "customer-payments", label: "Customer Payments", href: "/dashboard/sales/customer-payments", iconKey: "Wallet" },
      { pageKey: "customer-statement", label: "Customer Statement", href: "/dashboard/sales/customer-statement", iconKey: "BarChart3" },
      { pageKey: "empties-receive", label: "Empties Receive", href: "/dashboard/sales/empties-receive", iconKey: "Inbox" },
      { pageKey: "customer-empties-statement", label: "Customer Empties Statement", href: "/dashboard/sales/customer-empties-statement", iconKey: "Recycle" },
    ],
  },
  {
    moduleKey: "pos",
    label: "Point of Sale",
    iconKey: "CreditCard",
    children: [
      { pageKey: "overview", label: "Overview", href: "/dashboard/pos", iconKey: "CreditCard" },
      { pageKey: "new-sale", label: "New Sale", href: "/dashboard/pos/new-sale", iconKey: "ShoppingCart" },
      { pageKey: "parked", label: "Parked", href: "/dashboard/pos/parked", iconKey: "PauseCircle" },
      { pageKey: "receipts", label: "Receipts", href: "/dashboard/pos/receipts", iconKey: "Receipt" },
      { pageKey: "daily-payments", label: "Daily Payments", href: "/dashboard/pos/daily-payments", iconKey: "Wallet" },
      { pageKey: "targets", label: "Targets", href: "/dashboard/pos/targets", iconKey: "Target" },
      { pageKey: "performance", label: "Performance", href: "/dashboard/pos/performance", iconKey: "Gauge" },
      { pageKey: "achievements", label: "Achievements", href: "/dashboard/pos/achievements", iconKey: "Trophy" },
      { pageKey: "monthly-review", label: "Monthly Review", href: "/dashboard/pos/monthly-review", iconKey: "CalendarDays" },
    ],
  },
  {
    moduleKey: "inventory",
    label: "Inventory",
    iconKey: "Package",
    children: [
      { pageKey: "overview", label: "Overview", href: "/dashboard/inventory", iconKey: "LayoutDashboard" },
      { pageKey: "products", label: "Products", href: "/dashboard/inventory/products", iconKey: "Package" },
      { pageKey: "stocks-by-location", label: "Stocks by location", href: "/dashboard/inventory/stocks-by-location", iconKey: "MapPin" },
      { pageKey: "change-history", label: "Change history", href: "/dashboard/inventory/change-history", iconKey: "History" },
      { pageKey: "location-transfers", label: "Location Transfers", href: "/dashboard/inventory/location-transfers", iconKey: "ArrowLeftRight" },
    ],
  },
  {
    moduleKey: "production",
    label: "Production",
    iconKey: "Package",
    children: [
      { pageKey: "overview", label: "Overview", href: "/dashboard/production", iconKey: "Package" },
    ],
  },
  {
    moduleKey: "accounting",
    label: "Accounting & Finance",
    iconKey: "CreditCard",
    children: [
      { pageKey: "overview", label: "Overview", href: "/dashboard/accounting", iconKey: "LayoutDashboard" },
      { pageKey: "chart-of-accounts", label: "Chart of Accounts", href: "/dashboard/accounting/chart-of-accounts", iconKey: "FileText" },
      { pageKey: "payment-accounts", label: "Bank & Cash Accounts", href: "/dashboard/accounting/payment-accounts", iconKey: "Landmark" },
      { pageKey: "customer-payments", label: "Customer Payments", href: "/dashboard/sales/customer-payments", iconKey: "Wallet" },
      { pageKey: "supplier-payments", label: "Supplier Payments", href: "/dashboard/accounting/supplier-payments", iconKey: "Wallet" },
      { pageKey: "bank-transfers", label: "Bank Transfers", href: "/dashboard/accounting/bank-transfers", iconKey: "ArrowLeftRight" },
      { pageKey: "bank-reconciliation", label: "Bank Reconciliation", href: "/dashboard/accounting/bank-reconciliation", iconKey: "Calculator" },
      { pageKey: "ar-aging", label: "AR Aging", href: "/dashboard/accounting/ar-aging", iconKey: "Clock" },
      { pageKey: "ap-aging", label: "AP Aging", href: "/dashboard/accounting/ap-aging", iconKey: "Clock" },
      { pageKey: "gl-reports", label: "GL Reports", href: "/dashboard/accounting/gl-reports", iconKey: "BarChart3" },
    ],
  },
  {
    moduleKey: "hr",
    label: "HR & Payroll",
    iconKey: "Users",
    children: [
      { pageKey: "overview", label: "Overview", href: "/dashboard/hr", iconKey: "Users" },
    ],
  },
  {
    moduleKey: "reports",
    label: "Reports",
    iconKey: "BarChart3",
    children: [
      { pageKey: "overview", label: "Overview", href: "/dashboard/reports", iconKey: "BarChart3" },
    ],
  },
  {
    moduleKey: "settings",
    label: "Preferences",
    iconKey: "Settings",
    children: [
      { pageKey: "overview", label: "Overview", href: "/dashboard/settings", iconKey: "Settings" },
      { pageKey: "organization", label: "Organization", href: "/dashboard/settings/organization", iconKey: "Building2" },
      { pageKey: "master-data", label: "Master Data Settings", href: "/dashboard/settings/master-data", iconKey: "Package" },
      { pageKey: "location-management", label: "Locations", href: "/dashboard/settings/location-management", iconKey: "MapPin" },
      { pageKey: "import-data", label: "Import Data", href: "/dashboard/settings/import-data", iconKey: "Upload" },
      { pageKey: "users", label: "Users", href: "/dashboard/settings/users", iconKey: "Users" },
      { pageKey: "roles-permissions", label: "Roles & Permissions", href: "/dashboard/settings/roles-permissions", iconKey: "Shield" },
    ],
  },
];

/** All (moduleKey, pageKey) pairs that grant access to a route (pages can appear in multiple modules) */
export function getRoutePermissions(pathname: string): { moduleKey: string; pageKey: string | null }[] {
  const normalized = pathname.replace(/\/$/, "") || "/dashboard";
  const result: { moduleKey: string; pageKey: string | null }[] = [];

  for (const node of permissionTree) {
    for (const sub of node.children ?? []) {
      const subNorm = sub.href.replace(/\/$/, "") || "/dashboard";
      if (subNorm !== normalized) continue;

      const existing = result.find((r) => r.moduleKey === node.moduleKey && r.pageKey === sub.pageKey);
      if (!existing) result.push({ moduleKey: node.moduleKey, pageKey: sub.pageKey });
    }
  }

  if (result.length > 0) return result;

  const segments = normalized.replace(/^\/dashboard\/?/, "").split("/").filter(Boolean);
  if (segments.length === 0) return [{ moduleKey: "dashboard", pageKey: "overview" }];
  const moduleKey = segments[0];
  const pageKey = segments.length === 1 ? "overview" : segments[segments.length - 1];
  return [{ moduleKey, pageKey }];
}
