"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Layers,
  Menu,
  X,
  Search,
  Globe,
  Bell,
  Calendar,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getNavIcon } from "./nav-icons";
import type { MainNavItemSerialized } from "@/lib/nav-items";

interface TopNavbarProps {
  userEmail: string | undefined;
  userName?: string;
  userRole?: string | null;
  navItems: MainNavItemSerialized[];
}

const DEFAULT_MODULE: MainNavItemSerialized = {
  href: "/dashboard",
  label: "Dashboard",
  iconKey: "LayoutDashboard",
  subItems: [{ href: "/dashboard", label: "Overview", iconKey: "LayoutDashboard" }],
};

export default function TopNavbar({ userEmail, userName, userRole, navItems }: TopNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const pathname = usePathname();

  const currentModule =
    navItems.find(
      (m) => m.href === pathname || (m.href !== "/dashboard" && pathname.startsWith(m.href))
    ) ?? navItems[0] ?? DEFAULT_MODULE;

  return (
    <>
      {/* Red top strip */}
      <header className="sticky top-0 z-40 flex flex-col">
        <div
          className="flex h-12 items-center gap-4 px-4 text-navbar-foreground lg:px-6"
          style={{ backgroundColor: "var(--navbar)" }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="flex items-center justify-center rounded-md p-2 hover:bg-white/10 lg:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <Layers className="h-8 w-8 shrink-0" strokeWidth={2} style={{ color: "var(--navbar-foreground)" }} />
            <span className="hidden sm:inline-block">MasterBooks ERP</span>
          </Link>
          <div className="hidden flex-1 items-center justify-center gap-3 md:flex">
            <button
              type="button"
              className="flex items-center gap-2 rounded-md border border-white/30 bg-white/5 px-3 py-1.5 text-sm"
            >
              <span className="truncate max-w-[140px]">1 {userName ?? userEmail ?? "User"}</span>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </button>
            <button
              type="button"
              className="rounded-md border border-white/30 bg-white/5 px-3 py-1.5 text-sm"
            >
              Organization
            </button>
            <div
              className={cn(
                "flex items-center gap-2 rounded-md border bg-white/10 px-3 py-1.5 text-sm",
                searchFocused && "border-white/50 bg-white/15"
              )}
            >
              <Search className="h-4 w-4 shrink-0 opacity-80" />
              <input
                type="search"
                placeholder="Search or press Cmd+K"
                className="w-48 bg-transparent outline-none placeholder:text-white/80 sm:w-56"
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="rounded-md p-2 hover:bg-white/10" aria-label="Global">
              <Globe className="h-5 w-5" />
            </button>
            <button type="button" className="relative rounded-md p-2 hover:bg-white/10" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium">
                2
              </span>
            </button>
            <button type="button" className="relative rounded-md p-2 hover:bg-white/10" aria-label="Events">
              <Calendar className="h-5 w-5" />
              <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium">
                1
              </span>
            </button>
            <div className="flex items-center gap-2 border-l border-white/30 pl-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-medium">
                {(userName ?? userEmail ?? "U").charAt(0).toUpperCase()}
              </div>
              <div className="hidden text-left sm:block">
                <div className="text-xs font-medium leading-tight">{userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : "Member"}</div>
                <div className="flex items-center gap-0.5 text-xs opacity-90">
                  User
                  <ChevronDown className="h-3 w-3" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* White strip – main module tabs */}
        <div className="flex border-b border-border bg-background px-2 lg:px-4">
          <nav className="flex gap-1 overflow-x-auto py-0">
            {(navItems.length > 0 ? navItems : []).map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard" || pathname.startsWith("/dashboard/kpis") || pathname.startsWith("/dashboard/sync") || pathname.startsWith("/dashboard/notifications")
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "border-[var(--navbar)] text-[var(--navbar)]"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {(() => {
                    const Icon = getNavIcon(item.iconKey);
                    return <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-[var(--navbar)]")} />;
                  })()}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/50 lg:hidden",
          mobileOpen ? "block" : "hidden"
        )}
        style={{ top: "6rem" }}
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />
      <aside
        className={cn(
          "fixed left-0 z-30 h-[calc(100vh-6rem)] w-56 border-r border-border bg-muted/50 transition-transform lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ top: "6rem" }}
      >
        <nav className="flex flex-col gap-1 p-3">
          {currentModule.subItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {(() => {
                  const Icon = getNavIcon(item.iconKey);
                  return <Icon className="h-5 w-5 shrink-0" />;
                })()}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
