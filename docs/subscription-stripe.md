# Subscriptions: Stripe trial at sign-up

## Behavior

- New organizations pick one of **four tiers** at registration: Starter, Growth, Business, Enterprise ([`lib/subscription-tiers.ts`](../lib/subscription-tiers.ts)).
- After Supabase `signUp` and org creation (`start_registration` + `complete_registration`), the owner is sent to **Stripe Checkout** in **subscription** mode with **`trial_period_days: 14`**.
- **No subscription charge runs during the trial.** The first billing date is after the trial ends (per Stripe’s subscription schedule).
- The subscriber may **cancel before the trial ends** (e.g. Stripe Customer Portal or Dashboard) so no paid period starts for that subscription.
- Stripe may still perform **card verification** (e.g. $0 or bank-specific checks); that is separate from your recurring price.

## Environment variables

Set in the **server** environment (e.g. `.env.local`, Vercel):

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Server-side Stripe API |
| `STRIPE_WEBHOOK_SECRET` | Verify webhook signatures |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client if you add Elements later |
| `STRIPE_PRICE_STARTER` | Recurring Price id for Starter |
| `STRIPE_PRICE_GROWTH` | Recurring Price id for Growth |
| `STRIPE_PRICE_BUSINESS` | Recurring Price id for Business |
| `STRIPE_PRICE_ENTERPRISE` | Recurring Price id for Enterprise |
| `NEXT_PUBLIC_APP_URL` | Success/cancel URLs for Checkout |

If **no** Price IDs are set, registration **skips** Checkout and only shows the company code (useful for local dev).

## Database

Migration **`052_org_subscription_stripe.sql`** adds to `organizations`:

- `subscription_tier`, `trial_ends_at`, `subscription_status`, `stripe_customer_id`, `stripe_subscription_id`
- Extends `start_registration` with `p_subscription_tier`.

The webhook handler updates these from Stripe (`checkout.session.completed`, `customer.subscription.*`, `invoice.*`).

## Webhooks

Configure Stripe to send events to:

`https://<your-domain>/api/webhooks/stripe`

Recommended events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Use the **signing secret** from the Stripe CLI or Dashboard as `STRIPE_WEBHOOK_SECRET`.

## User flow

1. `/register` — choose tier, company, credentials → auth + org + `complete_registration`.
2. Redirect to Stripe Checkout → pay method collected; subscription created in `trialing`.
3. `/register/billing-success` — shows company code; user can sign out and log in with company code + email + password.
4. Dashboard navbar shows **Trial: N days left** or paid period countdown from synced fields.

## Customer portal (cancel during trial)

To let users self-cancel, enable the **Stripe Customer Portal** in the Dashboard and add a “Manage billing” link in app settings that creates a **billing portal session** (future enhancement; not required for webhook sync).

## Manual subscription end date

`organizations.subscription_ends_at` is still **mirrored from Stripe** (`current_period_end`). Admins can also set a date in Organization settings for legacy/manual use; the navbar falls back to that when Stripe status columns are absent.
