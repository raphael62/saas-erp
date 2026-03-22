import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReceiptsSearch } from "./ReceiptsSearch";

export default async function ReceiptsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Receipts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search POS receipts by date and print.
        </p>
      </div>
      <ReceiptsSearch />
    </div>
  );
}
