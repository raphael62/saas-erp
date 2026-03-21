-- Run after ADD_CUSTOMERS.sql
-- Adds: sales_reps table, price_type and sales_rep_id to customers
-- Run this in Supabase SQL Editor

-- 1. Sales reps (per organization) - must exist before customers can reference
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

-- Add price_type and sales_rep_id to customers
alter table public.customers add column if not exists price_type text default 'retail';
do $$
declare
  sales_rep_id_type text;
  current_customer_sales_rep_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into sales_rep_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'sales_reps'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if sales_rep_id_type is null then
    raise exception 'public.sales_reps.id not found. Ensure sales_reps table exists first.';
  end if;

  select format_type(a.atttypid, a.atttypmod)
    into current_customer_sales_rep_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'customers'
    and a.attname = 'sales_rep_id'
    and a.attnum > 0
    and not a.attisdropped;

  if current_customer_sales_rep_type is null then
    execute format('alter table public.customers add column sales_rep_id %s', sales_rep_id_type);
    current_customer_sales_rep_type := sales_rep_id_type;
  end if;

  if current_customer_sales_rep_type <> sales_rep_id_type then
    raise exception 'public.customers.sales_rep_id type (%) does not match public.sales_reps.id type (%).', current_customer_sales_rep_type, sales_rep_id_type;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.customers'::regclass
      and conname = 'customers_sales_rep_id_fkey'
  ) then
    execute 'alter table public.customers add constraint customers_sales_rep_id_fkey foreign key (sales_rep_id) references public.sales_reps(id) on delete set null';
  end if;
end $$;
