import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">The page you requested does not exist.</p>
      <Link href="/dashboard" className="text-sm font-medium text-[var(--navbar)] underline">
        Back to dashboard
      </Link>
    </div>
  );
}
