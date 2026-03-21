import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";

export default async function LocationTransfersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id?: string } | null)?.organization_id;
  if (!orgId) {
    return <div><p className="text-muted-foreground">Loading organization…</p></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Location Transfers</h1>
        <p className="text-sm text-muted-foreground">Transfer stock between locations</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">
            Location transfers require warehouse/location setup. Configure locations in Master Data Settings to enable transfers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
