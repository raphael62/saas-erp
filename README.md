# MasterBooks ERP

Multi-tenant ERP built with **Next.js**, **TypeScript**, **Supabase**, **Stripe**, and **Vercel**.

## Canonical Repository

- This folder/repo (`masterbooks-erp`) is the single source of truth for the MasterBooks ERP project.
- Use Supabase SQL files under `supabase/` for schema and migrations.
- Do not add or maintain parallel project folders for this product.

## Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Supabase** (Auth + PostgreSQL + RLS)
- **Stripe** (Billing webhooks)
- **Tailwind CSS**
- **Vercel** (Deploy)

UI is built with Tailwind CSS. To add [shadcn/ui](https://ui.shadcn.com) later, run `npx shadcn@latest init` in the project root.

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from a **development** [Supabase](https://supabase.com) project (see [Development vs production](#development-vs-production-databases) below)
- `SUPABASE_SERVICE_ROLE_KEY` from the same dev project (Settings → API → service_role)
- `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:3000`)
- Optional for local dev: `DEV_BYPASS_ORG=1` and `PLATFORM_ADMIN_EMAILS` — **never** set these on production
- For Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

### Development vs production databases

Use **two Supabase projects**: one for local development and one for production (deployed on Vercel). Pointing both at the same database causes mixed data, unpredictable login, and org/profile issues.

| Environment | Where credentials live | Notes |
|-------------|------------------------|--------|
| Local | `.env.local` | Dev project URL and keys; you can use `DEV_BYPASS_ORG=1` for easier access |
| Production | Vercel → Environment Variables | Production project only; do **not** set `DEV_BYPASS_ORG` |

**New developer setup:** create a dev Supabase project, run all migrations in `supabase/migrations/` on it (SQL Editor or `supabase link` + `supabase db push`), then put that project’s keys in `.env.local`. Seed a test user with `npm run seed:admin` if needed.

**Ongoing migrations:** apply new SQL to the dev project first, then to production after you verify.

### 3. Database (Supabase)

In the [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**, run migrations in order (or use `supabase db push` if the project is linked):

- `supabase/migrations/001_organizations_profiles.sql` — organizations, profiles, RLS, signup trigger
- Additional numbered migrations under `supabase/migrations/` for products, sales, POS, etc.

**Point of Sale:** after base sales tables exist, run `supabase/migrations/018_pos_sales_extensions.sql` so POS can store `empties_value`, `payment_method`, `cashier_id`, and line `is_promo`. Without it, `savePosSale` will fail when inserting invoices.

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up or log in to reach the dashboard.

### 5. Stripe webhook (optional)

To receive subscription events locally, use [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Use the printed webhook secret in `.env.local` as `STRIPE_WEBHOOK_SECRET`.

## Project structure

- `app/` – Routes (login, register, dashboard, API)
- `app/dashboard/pos/` – POS (new sale, parked sales, receipts search/reprint, daily payments)
- `lib/supabase/` – Supabase client (browser, server, middleware)
- `supabase/migrations/` – SQL migrations for Supabase
- `app/api/webhooks/stripe/` – Stripe webhook handler

## Deploy on Vercel

1. Push the repo to GitHub and import the project in Vercel.
2. Add environment variables for **production** only: your **production** Supabase URL, anon key, and service role key (not your local dev project). Set `NEXT_PUBLIC_APP_URL` to `https://masterbookserp.com` or your custom domain. Set `PLATFORM_ADMIN_EMAILS` if you need platform-admin access; do **not** set `DEV_BYPASS_ORG`.
3. Add Stripe keys as needed. In Stripe Dashboard, add a webhook endpoint: `https://your-app.vercel.app/api/webhooks/stripe` and set `STRIPE_WEBHOOK_SECRET` in Vercel.
