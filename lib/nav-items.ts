/**
 * Nav structure - serializable for Server→Client passing.
 * Uses iconKey (string) instead of icon components.
 */

export type NavIconKey =
  | "LayoutDashboard"
  | "ShoppingCart"
  | "Truck"
  | "Package"
  | "Gift"
  | "CreditCard"
  | "Users"
  | "BarChart3"
  | "Settings"
  | "RefreshCw"
  | "Bell"
  | "Upload"
  | "MapPin"
  | "Shield"
  | "History"
  | "ArrowLeftRight"
  | "PauseCircle"
  | "Receipt"
  | "Wallet"
  | "Target"
  | "Gauge"
  | "Trophy"
  | "CalendarDays"
  | "Recycle"
  | "Inbox"
  | "FileText"
  | "ClipboardList"
  | "FileStack"
  | "Calculator"
  | "Clock"
  | "Landmark"
  | "FileCheck"
  | "Building2";

export interface SubNavItemSerialized {
  href: string;
  label: string;
  iconKey: NavIconKey;
  badge?: string;
}

export type AllowedRoles = string[] | undefined;

export interface MainNavItemSerialized {
  href: string;
  label: string;
  iconKey: NavIconKey;
  subItems: SubNavItemSerialized[];
  allowedRoles?: AllowedRoles;
}

export const mainNavItems: MainNavItemSerialized[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    iconKey: "LayoutDashboard",
    allowedRoles: [],
    subItems: [
      { href: "/dashboard", label: "Overview", iconKey: "LayoutDashboard" },
      { href: "/dashboard/kpis", label: "KPIs", iconKey: "BarChart3" },
      { href: "/dashboard/sync-log", label: "Sync Log", iconKey: "RefreshCw" },
      { href: "/dashboard/notifications", label: "Notifications", iconKey: "Bell" },
    ],
  },
  {
    href: "/dashboard/purchases",
    label: "Purchases",
    iconKey: "Truck",
    allowedRoles: ["purchasing"],
    subItems: [
      { href: "/dashboard/purchases", label: "Overview", iconKey: "Truck" },
      { href: "/dashboard/purchases/suppliers", label: "Suppliers", iconKey: "Truck" },
      { href: "/dashboard/purchases/purchase-invoices", label: "Purchase Invoices", iconKey: "CreditCard" },
      { href: "/dashboard/purchases/supplier-statement", label: "Supplier Statement", iconKey: "FileText" },
      { href: "/dashboard/purchases/empties-dispatch", label: "Empties Dispatch", iconKey: "Recycle" },
    ],
  },
  {
    href: "/dashboard/sales",
    label: "Sales",
    iconKey: "ShoppingCart",
    allowedRoles: ["sales"],
    subItems: [
      { href: "/dashboard/sales", label: "Overview", iconKey: "ShoppingCart" },
      { href: "/dashboard/sales/sales-orders", label: "Sales Orders", iconKey: "FileCheck" },
      { href: "/dashboard/sales/customers", label: "Customers", iconKey: "Users" },
      { href: "/dashboard/sales/sales-reps", label: "Sales reps", iconKey: "Users" },
      { href: "/dashboard/sales/targets", label: "Sales Targets", iconKey: "Target" },
      { href: "/dashboard/sales/van-stock-requests", label: "Van Stock Requests", iconKey: "ClipboardList" },
      { href: "/dashboard/sales/load-out-sheets", label: "Load Out Sheets", iconKey: "FileStack" },
      { href: "/dashboard/sales/price-list", label: "Price List", iconKey: "BarChart3" },
      { href: "/dashboard/sales/promotions", label: "Promotions", iconKey: "Gift" },
      { href: "/dashboard/sales/sales-invoices", label: "Sales Invoices", iconKey: "CreditCard" },
      { href: "/dashboard/sales/customer-payments", label: "Customer Payments", iconKey: "Wallet" },
      { href: "/dashboard/sales/customer-statement", label: "Customer Statement", iconKey: "BarChart3" },
      { href: "/dashboard/sales/empties-receive", label: "Empties Receive", iconKey: "Inbox" },
      { href: "/dashboard/sales/customer-empties-statement", label: "Customer Empties Statement", iconKey: "Recycle" },
    ],
  },
  {
    href: "/dashboard/pos",
    label: "Point of Sale",
    iconKey: "CreditCard",
    allowedRoles: ["sales"],
    subItems: [
      { href: "/dashboard/pos", label: "Overview", iconKey: "CreditCard" },
      { href: "/dashboard/pos/new-sale", label: "New Sale", iconKey: "ShoppingCart" },
      { href: "/dashboard/pos/parked", label: "Parked", iconKey: "PauseCircle" },
      { href: "/dashboard/pos/receipts", label: "Receipts", iconKey: "Receipt" },
      { href: "/dashboard/pos/daily-payments", label: "Daily Payments", iconKey: "Wallet" },
      { href: "/dashboard/pos/targets", label: "Targets", iconKey: "Target" },
      { href: "/dashboard/pos/performance", label: "Performance", iconKey: "Gauge" },
      { href: "/dashboard/pos/achievements", label: "Achievements", iconKey: "Trophy" },
      { href: "/dashboard/pos/monthly-review", label: "Monthly Review", iconKey: "CalendarDays" },
    ],
  },
  {
    href: "/dashboard/inventory",
    label: "Inventory",
    iconKey: "Package",
    allowedRoles: ["sales", "purchasing", "inventory"],
    subItems: [
      { href: "/dashboard/inventory", label: "Overview", iconKey: "LayoutDashboard" },
      { href: "/dashboard/inventory/products", label: "Products", iconKey: "Package" },
      { href: "/dashboard/inventory/stocks-by-location", label: "Stocks by location", iconKey: "MapPin" },
      { href: "/dashboard/inventory/change-history", label: "Change history", iconKey: "History" },
      { href: "/dashboard/inventory/location-transfers", label: "Location Transfers", iconKey: "ArrowLeftRight" },
    ],
  },
  {
    href: "/dashboard/production",
    label: "Production",
    iconKey: "Package",
    allowedRoles: ["inventory"],
    subItems: [
      { href: "/dashboard/production", label: "Overview", iconKey: "Package" },
    ],
  },
  {
    href: "/dashboard/accounting",
    label: "Accounting & Finance",
    iconKey: "CreditCard",
    allowedRoles: ["accounting"],
    subItems: [
      { href: "/dashboard/accounting", label: "Overview", iconKey: "LayoutDashboard" },
      { href: "/dashboard/accounting/chart-of-accounts", label: "Chart of Accounts", iconKey: "FileText" },
      { href: "/dashboard/accounting/payment-accounts", label: "Bank & Cash Accounts", iconKey: "Landmark" },
      { href: "/dashboard/sales/customer-payments", label: "Customer Payments", iconKey: "Wallet" },
      { href: "/dashboard/accounting/supplier-payments", label: "Supplier Payments", iconKey: "Wallet" },
      { href: "/dashboard/accounting/bank-transfers", label: "Bank Transfers", iconKey: "ArrowLeftRight" },
      { href: "/dashboard/accounting/bank-reconciliation", label: "Bank Reconciliation", iconKey: "Calculator", badge: "Future" },
      { href: "/dashboard/accounting/ar-aging", label: "AR Aging", iconKey: "Clock" },
      { href: "/dashboard/accounting/ap-aging", label: "AP Aging", iconKey: "Clock", badge: "Future" },
      { href: "/dashboard/accounting/gl-reports", label: "GL Reports", iconKey: "BarChart3", badge: "Future" },
    ],
  },
  {
    href: "/dashboard/hr",
    label: "HR & Payroll",
    iconKey: "Users",
    allowedRoles: ["hr"],
    subItems: [
      { href: "/dashboard/hr", label: "Overview", iconKey: "Users" },
    ],
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    iconKey: "BarChart3",
    allowedRoles: [],
    subItems: [
      { href: "/dashboard/reports", label: "Overview", iconKey: "BarChart3" },
    ],
  },
  {
    href: "/dashboard/settings",
    label: "Preferences",
    iconKey: "Settings",
    allowedRoles: [],
    subItems: [
      { href: "/dashboard/settings", label: "Overview", iconKey: "Settings" },
      { href: "/dashboard/settings/organization", label: "Organization", iconKey: "Building2" },
      { href: "/dashboard/settings/master-data", label: "Master Data Settings", iconKey: "Package" },
      { href: "/dashboard/settings/location-management", label: "Locations", iconKey: "MapPin" },
      { href: "/dashboard/settings/import-data", label: "Import Data", iconKey: "Upload" },
      { href: "/dashboard/settings/users", label: "Users", iconKey: "Users" },
      { href: "/dashboard/settings/roles-permissions", label: "Roles & Permissions", iconKey: "Shield" },
    ],
  },
];
