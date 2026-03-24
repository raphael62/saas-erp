export default function SalesOrdersLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading orders…</p>
      </div>
    </div>
  );
}
