import { Button } from "@/components/ui/button";

export function NoOrgPrompt() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-950/30">
      <p className="font-medium text-amber-800 dark:text-amber-200">No organization assigned</p>
      <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
        Your organization is created when you register. If you just signed up, refresh the page. Otherwise, contact your administrator.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <a href="/dashboard">Refresh dashboard</a>
      </Button>
    </div>
  );
}
