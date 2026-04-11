"use client";

import type { ReactNode } from "react";
import { RouteCapabilityProvider } from "@/components/dashboard/route-capability-provider";

export function DashboardCapabilityShell({ children }: { children: ReactNode }) {
  return <RouteCapabilityProvider>{children}</RouteCapabilityProvider>;
}
