import Link from "next/link";

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Preferences</h1>
      <p className="text-muted-foreground mt-2">
        Use the sidebar under Preferences for each area. For theme color, open your{" "}
        <span className="text-foreground">user menu (top right)</span> → Appearance.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Or go directly:{" "}
        <Link href="/dashboard/settings/appearance" className="text-foreground underline-offset-4 hover:underline">
          Theme color settings
        </Link>
        .
      </p>
    </div>
  );
}
