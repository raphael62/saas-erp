-- Bootstrap: customers and sales_reps (run before migrations 005+)
-- Run once via: npx supabase db query --linked -f supabase/bootstrap_customers_sales_reps.sql

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_person text,
  email text,
  phone text,
  address text,
  tax_id text,
  credit_limit numeric(12, 2) default 0,
  payment_terms integer default 30,
  customer_type text default 'retail',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_customers_organization on public.customers(organization_id);
alter table public.customers enable row level security;

drop policy if exists "Users can read own org customers" on public.customers;
create policy "Users can read own org customers" on public.customers for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can insert own org customers" on public.customers;
create policy "Users can insert own org customers" on public.customers for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can update own org customers" on public.customers;
create policy "Users can update own org customers" on public.customers for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can delete own org customers" on public.customers;
create policy "Users can delete own org customers" on public.customers for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create table if not exists public.sales_reps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  name text not null,
  phone text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_sales_reps_organization on public.sales_reps(organization_id);
alter table public.sales_reps enable row level security;

drop policy if exists "Users can read own org sales_reps" on public.sales_reps;
create policy "Users can read own org sales_reps" on public.sales_reps for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can insert own org sales_reps" on public.sales_reps;
create policy "Users can insert own org sales_reps" on public.sales_reps for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can update own org sales_reps" on public.sales_reps;
create policy "Users can update own org sales_reps" on public.sales_reps for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can delete own org sales_reps" on public.sales_reps;
create policy "Users can delete own org sales_reps" on public.sales_reps for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

alter table public.customers add column if not exists price_type text default 'retail';
alter table public.customers add column if not exists sales_rep_id uuid references public.sales_reps(id) on delete set null;
