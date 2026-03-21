export default function POSPage() {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Point of Sale</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the POS items in the sidebar to open each workspace.
        </p>
      </div>
      <div className="rounded border border-border bg-card p-4">
        <h2 className="text-base font-semibold">POS Overview</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Navigate from the sidebar to New Sale, Parked, Receipts, Daily Payments,
          Targets, Performance, Achievements, and Monthly Review.
        </p>
      </div>
    </div>
  );
}
