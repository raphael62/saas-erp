"use client";

import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Package,
  Gift,
  CreditCard,
  Users,
  BarChart3,
  Settings,
  RefreshCw,
  Bell,
  Upload,
  MapPin,
  History,
  ArrowLeftRight,
  PauseCircle,
  Receipt,
  Wallet,
  Target,
  Gauge,
  Trophy,
  CalendarDays,
  Recycle,
  Inbox,
  FileText,
  ClipboardList,
  FileStack,
  Calculator,
  Clock,
  Landmark,
  type LucideIcon,
} from "lucide-react";

export interface SubNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Optional badge text (e.g. "Future") shown on the right */
  badge?: string;
}

/** Roles that can access this module. Empty/undefined = all roles. admin always sees all. */
export type AllowedRoles = string[] | undefined;

export interface MainNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  subItems: SubNavItem[];
  /** Roles allowed to see this module. Omit or [] = all. admin always sees all. */
  allowedRoles?: AllowedRoles;
}

// Main modules for the top tab bar (white strip)
export const mainNavItems: MainNavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    allowedRoles: [], // all
    subItems: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/kpis", label: "KPIs", icon: BarChart3 },
      { href: "/dashboard/sync-log", label: "Sync Log", icon: RefreshCw },
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    href: "/dashboard/purchases",
    label: "Purchases",
    icon: Truck,
    allowedRoles: ["purchasing"],
    subItems: [
      { href: "/dashboard/purchases", label: "Overview", icon: Truck },
      { href: "/dashboard/purchases/suppliers", label: "Suppliers", icon: Truck },
      { href: "/dashboard/purchases/purchase-invoices", label: "Purchase Invoices", icon: CreditCard },
      { href: "/dashboard/purchases/supplier-statement", label: "Supplier Statement", icon: FileText },
      { href: "/dashboard/purchases/empties-dispatch", label: "Empties Dispatch", icon: Recycle },
    ],
  },
  {
    href: "/dashboard/sales",
    label: "Sales",
    icon: ShoppingCart,
    allowedRoles: ["sales"],
    subItems: [
      { href: "/dashboard/sales", label: "Overview", icon: ShoppingCart },
      { href: "/dashboard/sales/customers", label: "Customers", icon: Users },
      { href: "/dashboard/sales/sales-reps", label: "Sales reps", icon: Users },
      { href: "/dashboard/sales/targets", label: "Sales Targets", icon: Target },
      { href: "/dashboard/sales/van-stock-requests", label: "Van Stock Requests", icon: ClipboardList },
      { href: "/dashboard/sales/load-out-sheets", label: "Load Out Sheets", icon: FileStack },
      { href: "/dashboard/sales/price-list", label: "Price List", icon: BarChart3 },
      { href: "/dashboard/sales/promotions", label: "Promotions", icon: Gift },
      { href: "/dashboard/sales/sales-invoices", label: "Sales Invoices", icon: CreditCard },
      { href: "/dashboard/sales/customer-payments", label: "Customer Payments", icon: Wallet },
      { href: "/dashboard/sales/customer-statement", label: "Customer Statement", icon: BarChart3 },
      { href: "/dashboard/sales/empties-receive", label: "Empties Receive", icon: Inbox },
      { href: "/dashboard/sales/customer-empties-statement", label: "Customer Empties Statement", icon: Recycle },
    ],
  },
  {
    href: "/dashboard/pos",
    label: "Point of Sale",
    icon: CreditCard,
    allowedRoles: ["sales"],
    subItems: [
      { href: "/dashboard/pos", label: "Overview", icon: CreditCard },
      { href: "/dashboard/pos/new-sale", label: "New Sale", icon: ShoppingCart },
      { href: "/dashboard/pos/parked", label: "Parked", icon: PauseCircle },
      { href: "/dashboard/pos/receipts", label: "Receipts", icon: Receipt },
      { href: "/dashboard/pos/daily-payments", label: "Daily Payments", icon: Wallet },
      { href: "/dashboard/pos/targets", label: "Targets", icon: Target },
      { href: "/dashboard/pos/performance", label: "Performance", icon: Gauge },
      { href: "/dashboard/pos/achievements", label: "Achievements", icon: Trophy },
      { href: "/dashboard/pos/monthly-review", label: "Monthly Review", icon: CalendarDays },
    ],
  },
  {
    href: "/dashboard/inventory",
    label: "Inventory",
    icon: Package,
    allowedRoles: ["sales", "purchasing", "inventory"],
    subItems: [
      { href: "/dashboard/inventory", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/inventory/products", label: "Products", icon: Package },
      { href: "/dashboard/inventory/stocks-by-location", label: "Stocks by location", icon: MapPin },
      { href: "/dashboard/inventory/change-history", label: "Change history", icon: History },
      { href: "/dashboard/inventory/location-transfers", label: "Location Transfers", icon: ArrowLeftRight },
    ],
  },
  {
    href: "/dashboard/production",
    label: "Production",
    icon: Package,
    allowedRoles: ["inventory"],
    subItems: [
      { href: "/dashboard/production", label: "Overview", icon: Package },
    ],
  },
  {
    href: "/dashboard/accounting",
    label: "Accounting & Finance",
    icon: CreditCard,
    allowedRoles: ["accounting"],
    subItems: [
      { href: "/dashboard/accounting", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/accounting/chart-of-accounts", label: "Chart of Accounts", icon: FileText },
      { href: "/dashboard/accounting/payment-accounts", label: "Bank & Cash Accounts", icon: Landmark },
      { href: "/dashboard/sales/customer-payments", label: "Customer Payments", icon: Wallet },
      { href: "/dashboard/accounting/supplier-payments", label: "Supplier Payments", icon: Wallet },
      { href: "/dashboard/accounting/bank-transfers", label: "Bank Transfers", icon: ArrowLeftRight },
      { href: "/dashboard/accounting/bank-reconciliation", label: "Bank Reconciliation", icon: Calculator, badge: "Future" },
      { href: "/dashboard/accounting/ar-aging", label: "AR Aging", icon: Clock },
      { href: "/dashboard/accounting/ap-aging", label: "AP Aging", icon: Clock, badge: "Future" },
      { href: "/dashboard/accounting/gl-reports", label: "GL Reports", icon: BarChart3, badge: "Future" },
    ],
  },
  {
    href: "/dashboard/hr",
    label: "HR & Payroll",
    icon: Users,
    allowedRoles: ["hr"],
    subItems: [
      { href: "/dashboard/hr", label: "Overview", icon: Users },
    ],
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    icon: BarChart3,
    allowedRoles: [], // all
    subItems: [
      { href: "/dashboard/reports", label: "Overview", icon: BarChart3 },
    ],
  },
  {
    href: "/dashboard/settings",
    label: "Preferences",
    icon: Settings,
    allowedRoles: [], // all
    subItems: [
      { href: "/dashboard/settings", label: "Overview", icon: Settings },
      { href: "/dashboard/settings/master-data", label: "Master Data Settings", icon: Package },
      { href: "/dashboard/settings/location-management", label: "Locations", icon: MapPin },
      { href: "/dashboard/settings/import-data", label: "Import Data", icon: Upload },
    ],
  },
];

