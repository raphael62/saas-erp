"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MainNavItem } from "./nav-config";

interface SidebarProps {
  navItems: MainNavItem[];
}

export default function Sidebar({ navItems }: SidebarProps) {
  const pathname = usePathname();

  const currentModule =
    navItems.find(
      (m) =>
        m.href === pathname ||
        (m.href !== "/dashboard" && pathname.startsWith(m.href))
    ) ?? navItems[0] ?? { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, subItems: [{ href: "/dashboard", label: "Overview", icon: LayoutDashboard }] };

  return (
    <aside className="hidden w-56 flex-col border-r border-border bg-muted/40 lg:flex">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-semibold text-foreground">{currentModule.label}</h2>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Collapse sidebar"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {currentModule.subItems.map((item) => {
          const isParentPath = currentModule.subItems.some(
            (s) => s.href !== item.href && s.href.startsWith(item.href + "/")
          );
          const isActive = isParentPath
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.badge && (
                <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-400">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
