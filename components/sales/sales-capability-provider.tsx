"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { PageCapabilityFlags } from "@/lib/permissions";
import { getSalesAreaCapabilityFlags } from "@/lib/sales-capability-actions";

type CapState = PageCapabilityFlags & { loading: boolean };

const defaultCaps: CapState = {
  canView: true,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canExport: false,
  loading: true,
};

const SalesCapabilityContext = createContext<CapState>(defaultCaps);

export function SalesCapabilityProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [state, setState] = useState<CapState>(defaultCaps);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    void (async () => {
      const res = await getSalesAreaCapabilityFlags(pathname);
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

  return <SalesCapabilityContext.Provider value={state}>{children}</SalesCapabilityContext.Provider>;
}

export function useSalesCapabilities() {
  return useContext(SalesCapabilityContext);
}
