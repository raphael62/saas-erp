-- Customers and sales_reps tables (required for customer payments, statements, empties)
-- These were previously in standalone ADD_ scripts; now in migrations for proper setup.

-- 1. Sales reps (must exist before customers.sales_rep_id)
create table if not exists public.sales_reps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  name text not null,
  phone text,
  email text,
  first_name text,
  last_name text,
  sales_rep_type text,
  company text,
  location text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
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

-- 2. Customers
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
  price_type text default 'retail',
  sales_rep_id uuid references public.sales_reps(id) on delete set null,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_customers_organization on public.customers(organization_id);
create index if not exists idx_customers_sales_rep on public.customers(sales_rep_id);
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

-- Ensure customer_payments exists (033 may have failed if customers didn't exist)
create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_no text not null,
  customer_id uuid references public.customers(id) on delete set null,
  payment_date date not null,
  bank_date date,
  payment_account text,
  amount numeric(14, 2) not null default 0,
  payment_method text not null default 'Cash',
  reference text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, payment_no)
);

create index if not exists idx_customer_payments_org on public.customer_payments(organization_id);
create index if not exists idx_customer_payments_customer on public.customer_payments(customer_id);
create index if not exists idx_customer_payments_date on public.customer_payments(payment_date);

alter table public.customer_payments enable row level security;

drop policy if exists "Users can read own org customer_payments" on public.customer_payments;
create policy "Users can read own org customer_payments" on public.customer_payments for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org customer_payments" on public.customer_payments;
create policy "Users can insert own org customer_payments" on public.customer_payments for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org customer_payments" on public.customer_payments;
create policy "Users can update own org customer_payments" on public.customer_payments for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org customer_payments" on public.customer_payments;
create policy "Users can delete own org customer_payments" on public.customer_payments for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
