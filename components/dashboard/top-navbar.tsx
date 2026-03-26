"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Layers,
  Menu,
  X,
  Search,
  ChevronDown,
  LogOut,
  Settings,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getNavIcon } from "./nav-icons";
import type { MainNavItemSerialized } from "@/lib/nav-items";
import { createClient } from "@/lib/supabase/client";

export type NavbarSubscription =
  | { kind: "none" }
  | { kind: "expired" }
  | { kind: "active"; daysLeft: number };

interface TopNavbarProps {
  userEmail: string | undefined;
  userName?: string;
  companyName?: string | null;
  subscription: NavbarSubscription;
  navItems: MainNavItemSerialized[];
}

const DEFAULT_MODULE: MainNavItemSerialized = {
  href: "/dashboard",
  label: "Dashboard",
  iconKey: "LayoutDashboard",
  subItems: [{ href: "/dashboard", label: "Overview", iconKey: "LayoutDashboard" }],
};

function SubscriptionPill({ subscription }: { subscription: NavbarSubscription }) {
  if (subscription.kind === "none") return null;
  if (subscription.kind === "expired") {
    return (
      <span
        className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white ring-1 ring-red-400/60"
        title="Subscription has ended"
      >
        <span className="hidden sm:inline">Expired</span>
        <span className="sm:hidden">!</span>
      </span>
    );
  }
  const { daysLeft } = subscription;
  const urgent = daysLeft <= 3;
  const soon = daysLeft <= 14 && !urgent;
  const tone = urgent
    ? "bg-red-500/25 text-white ring-red-300/50"
    : soon
      ? "bg-amber-400/20 text-amber-50 ring-amber-200/40"
      : "bg-white/15 text-white ring-white/30";
  return (
    <span
      className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1", tone)}
      title="Days remaining in current subscription period"
    >
      <span className="hidden sm:inline">
        {daysLeft} day{daysLeft === 1 ? "" : "s"} left
      </span>
      <span className="sm:hidden">{daysLeft}d</span>
    </span>
  );
}

export default function TopNavbar({
  userEmail,
  userName,
  companyName,
  subscription,
  navItems,
}: TopNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const displayName =
    (userName && userName.trim()) || (userEmail ? userEmail.split("@")[0] : null) || "User";

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener("pointerdown", handlePointerDown);
      return () => document.removeEventListener("pointerdown", handlePointerDown);
    }
  }, [userMenuOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setUserMenuOpen(false);
    }
    if (userMenuOpen) {
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [userMenuOpen]);

  async function handleSignOut() {
    setUserMenuOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const currentModule =
    navItems.find(
      (m) => m.href === pathname || (m.href !== "/dashboard" && pathname.startsWith(m.href))
    ) ?? navItems[0] ?? DEFAULT_MODULE;

  return (
    <>
      <header className="sticky top-0 z-40 flex flex-col">
        <div
          className="flex h-12 items-center gap-2 px-3 text-navbar-foreground sm:gap-3 sm:px-4 lg:px-6"
          style={{ backgroundColor: "var(--navbar)" }}
        >
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              className="flex items-center justify-center rounded-md p-2 hover:bg-white/10 lg:hidden"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
              <Layers className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" strokeWidth={2} style={{ color: "var(--navbar-foreground)" }} />
              <span className="hidden min-[380px]:inline-block">MasterBooks ERP</span>
            </Link>
          </div>

          <div className="flex min-w-0 flex-1 justify-center px-1 sm:px-4">
            <div
              className={cn(
                "flex w-full max-w-lg items-center gap-2 rounded-md border bg-white/10 px-3 py-1.5 text-sm",
                searchFocused ? "border-white/50 bg-white/15" : "border-white/25"
              )}
            >
              <Search className="h-4 w-4 shrink-0 opacity-80" />
              <input
                type="search"
                placeholder="Search or press Cmd+K"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/80"
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div
              className="hidden max-w-[100px] min-w-0 text-right text-sm font-semibold leading-tight sm:block sm:max-w-[160px] md:max-w-[220px] lg:max-w-[280px]"
              style={{ color: "var(--navbar-foreground)" }}
            >
              {companyName ? (
                <span className="block truncate" title={companyName}>
                  {companyName}
                </span>
              ) : (
                <span className="opacity-70">—</span>
              )}
            </div>
            <SubscriptionPill subscription={subscription} />
            <div className="relative border-l border-white/30 pl-2 sm:pl-3" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                className="flex max-w-[200px] items-center gap-2 rounded-md border border-white/30 bg-white/5 px-2 py-1.5 text-sm hover:bg-white/10 sm:max-w-[260px] sm:px-3"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-medium">
                  {displayName.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1 text-left max-sm:hidden">
                  <div className="truncate font-medium leading-tight">{displayName}</div>
                </div>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 opacity-90 transition-transform", userMenuOpen && "rotate-180")}
                />
              </button>

              {userMenuOpen ? (
                <div
                  role="menu"
                  aria-orientation="vertical"
                  className="absolute right-0 top-[calc(100%+0.25rem)] z-50 w-56 rounded-md border border-border bg-card py-1 text-card-foreground shadow-lg"
                >
                  <div className="border-b border-border px-3 py-2 sm:hidden">
                    <div className="truncate text-sm font-medium">{displayName}</div>
                  </div>
                  {companyName && (
                    <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground md:hidden">
                      <span className="block truncate font-medium text-foreground" title={companyName}>
                        {companyName}
                      </span>
                    </div>
                  )}
                  {userEmail && (
                    <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                      <span className="block truncate" title={userEmail}>
                        {userEmail}
                      </span>
                    </div>
                  )}
                  <Link
                    href="/dashboard/settings/appearance"
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Palette className="h-4 w-4 shrink-0 opacity-70" />
                    Appearance
                  </Link>
                  <Link
                    href="/dashboard/settings/organization"
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Settings className="h-4 w-4 shrink-0 opacity-70" />
                    Organization settings
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-muted"
                    onClick={() => void handleSignOut()}
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex border-b border-border bg-background px-2 lg:px-4">
          <nav className="flex gap-1 overflow-x-auto py-0">
            {(navItems.length > 0 ? navItems : []).map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard" ||
                    pathname.startsWith("/dashboard/kpis") ||
                    pathname.startsWith("/dashboard/sync") ||
                    pathname.startsWith("/dashboard/notifications")
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

      <div
        className={cn("fixed inset-0 z-30 bg-black/50 lg:hidden", mobileOpen ? "block" : "hidden")}
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
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navbar)]/35",
                  isActive
                    ? "bg-[color-mix(in_srgb,var(--navbar)_16%,var(--muted))] font-semibold text-[var(--navbar)]"
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
