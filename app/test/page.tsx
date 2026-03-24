export default function TestPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <p className="text-lg">If you see this, the server responds.</p>
      <p className="mt-2 text-sm text-muted-foreground">
        <a href="/api/health" className="underline">/api/health</a>
        {" · "}
        <a href="/dashboard" className="underline">Dashboard</a>
      </p>
    </main>
  );
}
