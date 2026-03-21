-- Run after ADD_PRODUCTS_AND_ORG.sql
-- Suppliers table (multi-tenant)

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  name text not null,
  category text,
  tax_id text,
  contact_person text,
  phone text,
  mobile text,
  email text,
  address text,
  city text,
  payment_terms integer default 30,
  bank_name text,
  bank_account text,
  bank_branch text,
  credit_limit numeric(14, 2) not null default 0,
  currency text not null default 'GHS',
  supplier_status text not null default 'Active',
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists public.suppliers add column if not exists code text;
alter table if exists public.suppliers add column if not exists category text;
alter table if exists public.suppliers add column if not exists mobile text;
alter table if exists public.suppliers add column if not exists city text;
alter table if exists public.suppliers add column if not exists bank_name text;
alter table if exists public.suppliers add column if not exists bank_account text;
alter table if exists public.suppliers add column if not exists bank_branch text;
alter table if exists public.suppliers add column if not exists credit_limit numeric(14, 2) not null default 0;
alter table if exists public.suppliers add column if not exists currency text not null default 'GHS';
alter table if exists public.suppliers add column if not exists supplier_status text not null default 'Active';
alter table if exists public.suppliers add column if not exists notes text;

create unique index if not exists idx_suppliers_org_code_unique
  on public.suppliers(organization_id, code)
  where code is not null and btrim(code) <> '';

create index if not exists idx_suppliers_organization on public.suppliers(organization_id);

alter table public.suppliers enable row level security;

drop policy if exists "Users can read own org suppliers" on public.suppliers;
create policy "Users can read own org suppliers" on public.suppliers for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can insert own org suppliers" on public.suppliers;
create policy "Users can insert own org suppliers" on public.suppliers for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can update own org suppliers" on public.suppliers;
create policy "Users can update own org suppliers" on public.suppliers for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can delete own org suppliers" on public.suppliers;
create policy "Users can delete own org suppliers" on public.suppliers for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
