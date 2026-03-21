# Supplier statement → edit document navigation

Clicking a reference on the supplier statement should open Purchase Invoices, Supplier Payments, or Empties Dispatch with the edit dialog.

## What we use

1. **`?edit=<uuid>`** in the URL (server `searchParams` + client `useSearchParams`).
2. **`lib/statement-edit-bridge.ts`** — before `router.push`, the full `href` is stored in `sessionStorage`. The destination page reads it when `window.location.pathname` matches and opens the form if the id exists in the loaded list. This covers cases where the query string is lost during App Router navigation/hydration.

## Do not

- Call `router.replace` to strip `?edit=` in the same tick as opening the form (can remount and reset state). Strip `?edit=` only when the user **closes** the dialog (see `onOpenChange` on those list components).

## If it still fails

- Confirm the user’s role can access the target route (e.g. purchasing vs accounting for supplier payments).
- Check the browser console for errors.
- Verify the invoice/payment/dispatch id exists in the org’s data returned on that page.
