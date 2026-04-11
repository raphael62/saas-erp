"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { PageCapabilityFlags } from "@/lib/permissions";
import { fetchDashboardRouteCapabilityFlags } from "@/lib/dashboard-route-capability-actions";

type CapState = PageCapabilityFlags & { loading: boolean };

const defaultCaps: CapState = {
  canView: true,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canExport: false,
  loading: true,
};

const RouteCapabilityContext = createContext<CapState>(defaultCaps);

export function RouteCapabilityProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [state, setState] = useState<CapState>(defaultCaps);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    void (async () => {
      const res = await fetchDashboardRouteCapabilityFlags(pathname);
      if (cancelled) return;
      if ("error" in res) {
        setState({
          canView: true,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canExport: false,
          loading: false,
        });
        return;
      }
      setState({ ...res, loading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return <RouteCapabilityContext.Provider value={state}>{children}</RouteCapabilityContext.Provider>;
}

export function useRouteCapabilities() {
  return useContext(RouteCapabilityContext);
}

/** @deprecated Use useRouteCapabilities — alias for existing sales components. */
export const useSalesCapabilities = useRouteCapabilities;
