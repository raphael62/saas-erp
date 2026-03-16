import Link from "next/link";

const modules = [
  { title: "Sales", href: "/dashboard/sales", desc: "Orders and customers", stat: "—" },
  { title: "Purchases", href: "/dashboard/purchases", desc: "Suppliers and POs", stat: "—" },
  { title: "Inventory", href: "/dashboard/inventory", desc: "Stock and movements", stat: "—" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your ERP modules. Connect Supabase and add data to see live stats.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-muted-foreground/30 hover:bg-muted/50"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-foreground group-hover:underline">{item.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
              </div>
              <span className="rounded-md bg-muted px-2 py-1 text-sm font-medium text-muted-foreground">
                {item.stat}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Next steps:</strong> Run the SQL in{" "}
        <code className="rounded bg-muted px-1">supabase/migrations/001_organizations_profiles.sql</code>{" "}
        in your Supabase project, then add the auth trigger so new signups get a profile.
      </div>
    </div>
  );
}
