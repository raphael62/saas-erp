-- Run this in Supabase SQL Editor after ADD_PRODUCTS_AND_ORG.sql
-- Customers table (multi-tenant)

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
