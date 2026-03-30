"use client";

import { createClient } from "@/lib/supabase/client";

export function RegisterBillingSignOutButton({ loginHref }: { loginHref: string }) {
  return (
    <button
      type="button"
      className="mt-4 w-full rounded-md bg-foreground py-2 font-medium text-background hover:opacity-90"
      onClick={async () => {
        await createClient().auth.signOut();
        window.location.href = loginHref;
      }}
    >
      Sign out and go to log in
    </button>
  );
}
