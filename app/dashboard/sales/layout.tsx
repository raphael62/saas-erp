import { SalesCapabilityProvider } from "@/components/sales/sales-capability-provider";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return <SalesCapabilityProvider>{children}</SalesCapabilityProvider>;
}
