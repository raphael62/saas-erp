# CLAUDE.md — saas-erp

## Project overview

Full-stack SaaS ERP system for sales, inventory, and customer management.

- **Framework**: Next.js 15 App Router (TypeScript)
- **Database / Auth**: Supabase (project ref: `nbqrxwueesdzibtruzxi`)
- **Styling**: Tailwind CSS v4 + custom CSS variables (`--navbar`, `--navbar-foreground`, etc.)
- **UI primitives**: Custom `components/ui/` (Dialog, Button, etc.) — not shadcn verbatim
- **Platform**: Windows dev environment, deployed to Vercel

## Environment

`.env.local` must exist at the project root with:
```
NEXT_PUBLIC_SUPABASE_URL=https://nbqrxwueesdzibtruzxi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<key>
```

## Key architectural patterns

### `(popup)` route group — `app/(popup)/`

Lightweight routes that render a single form with **no sidebar or navbar**. Used as iframe targets inside `TransactionEditOverlay`. Auth is checked in `app/(popup)/layout.tsx`.

| Route | Purpose |
|---|---|
| `/invoice/[id]` | Edit a sales invoice |
| `/payment/[id]` | Edit a customer payment |
| `/empties-receive/[id]` | Edit an empties receive |

Each route has:
- A server page (`page.tsx`) that fetches the record + reference data
- A `"use client"` popup client in `components/popup/` that renders the form

### `TransactionEditOverlay` — `components/ui/transaction-edit-overlay.tsx`

Portal (via `createPortal` to `document.body`) that renders an iframe at `z-[101]` on top of any open dialogs. Used from customer statement and empties statement pages.

**Auto-close**: The overlay listens for `window.addEventListener("message", ...)`. When the form inside the iframe calls `window.parent.postMessage({ type: "close-overlay" }, "*")`, the overlay closes.

### `inline` prop on `Dialog` — `components/ui/dialog.tsx`

When `inline={true}`, the Dialog skips its portal/backdrop/modal-positioning and renders content as a plain `<div>`. Used in popup clients so the form fills the iframe directly without a double header.

### `skipHistoryReplace` prop

`SalesInvoiceList`, `CustomerPayments`, and `EmptiesReceiveList` all call `window.history.replaceState` when opened with a deep-link `editId`. In popup iframe contexts this breaks `router.refresh()`. Pass `skipHistoryReplace={true}` (already set in popup clients via the `inline` approach — the list components are not used in popups, the form dialogs are used directly).

### Popup client pattern

```tsx
// components/popup/xxx-popup-client.tsx
"use client";
import { useRouter } from "next/navigation";
import { XFormDialog } from "@/components/sales/...";

export function XPopupClient({ ...props }) {
  const router = useRouter();
  return (
    <XFormDialog
      open
      inline
      onOpenChange={(open) => { if (!open) window.parent.postMessage({ type: "close-overlay" }, "*"); }}
      onSaved={() => router.refresh()}
      {...props}
    />
  );
}
```

## Statement pages with overlay editing

### Customer Statement — `app/dashboard/sales/customer-statement/`

- `actions.ts` builds `edit_path` as `/invoice/{id}` or `/payment/{id}` (popup routes)
- `components/sales/customer-statement.tsx` holds `editOverlayPath` state and renders `<TransactionEditOverlay>`
- Clicking a reference in the statement opens the overlay

### Customer Empties Statement — `app/dashboard/sales/customer-empties-statement/`

- `actions.ts` builds `edit_path` as `/invoice/{id}` or `/empties-receive/{id}`
- `components/sales/customer-empties-statement.tsx` uses the same overlay pattern

## Form components with `inline` support

| Component | File |
|---|---|
| `SalesInvoiceFormDialog` | `components/sales/sales-invoice-form-dialog.tsx` |
| `SinglePaymentDialog` | `components/sales/customer-payments.tsx` |
| `EmptiesReceiveFormDialog` (exported) | `components/sales/empties-receive-list.tsx` |

All accept `inline?: boolean` which is forwarded to `<Dialog>`.

## Commands

```bash
npm run dev      # start dev server (port 3000)
npm run build    # production build
npx tsc --noEmit # type-check without building
```
