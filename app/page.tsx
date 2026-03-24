import Link from "next/link";
import { Layers } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 bg-background text-foreground">
      <div className="flex items-center gap-3">
        <Layers className="h-12 w-12 text-foreground" strokeWidth={2} />
        <h1 className="text-3xl font-semibold">MasterBooks ERP</h1>
      </div>
      <p className="text-muted-foreground text-center max-w-md">
        Multi-tenant ERP — Dashboard, Sales, Purchases, Inventory, and more.
      </p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded-md bg-foreground px-4 py-2 text-background hover:opacity-90"
        >
          Log in
        </Link>
        <Link
          href="/register"
          className="rounded-md border border-border px-4 py-2 hover:bg-muted"
        >
          Sign up
        </Link>
      </div>
    </main>
  );
}
