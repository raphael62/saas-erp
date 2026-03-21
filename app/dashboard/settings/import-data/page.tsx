import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImportDataManager } from "@/components/settings/import-data-manager";

export default async function ImportDataPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/dashboard/settings" className="hover:text-foreground">Preferences</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Import Data</span>
      </nav>

      <ImportDataManager />
    </div>
  );
}
