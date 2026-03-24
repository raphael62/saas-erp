import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getProfileWithOrg } from "@/lib/org-context";
import { NoOrgPrompt } from "@/components/dashboard/no-org-prompt";

export default async function ChangeHistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await getProfileWithOrg(user.id, user.email ?? undefined);
  if (!orgId) return <NoOrgPrompt />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Change history</h1>
        <p className="text-sm text-muted-foreground">Stock adjustments and movements</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">No stock movements recorded yet. Changes from purchases, sales, and transfers will appear here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
